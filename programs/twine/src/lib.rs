use anchor_lang::prelude::*;
use anchor_spl::token::{Token, TokenAccount, Mint};

declare_id!("ECUN8sf6PiSxXD5E3rBd9ZSWonoxb6G9HJHuPQB4vfBg");

const STORE_SEED_BYTES : &[u8] ="store".as_bytes();
const PRODUCT_SEED_BYTES : &[u8] = "product".as_bytes();
const PRODUCT_MINT_SEED_BYTES : &[u8] = "product_mint".as_bytes();
const MINT_PRODUCT_REF_SEED_BYTES : &[u8] = "mint_product_ref".as_bytes();

#[program]
pub mod twine {
    use super::*;
    
    pub fn create_store(ctx: Context<CreateStore>, _store_id: String, name: String, description: String) -> Result<()> {
        let store = &mut ctx.accounts.store;

        store.bump = *ctx.bumps.get("store").unwrap();
        store.store_id =_store_id;
        store.owner = ctx.accounts.owner.key();
        store.name = name;
        store.description = description;        
        store.product_count = 0;

        Ok(())
    }


    pub fn update_store(ctx: Context<UpdateStore>, name: String, description: String) -> Result<()> {
        let store = &mut ctx.accounts.store;
        store.name = name;
        store.description = description;

        Ok(())
    }


    pub fn create_product(ctx: Context<CreateProduct>, _product_id: String, _decimals: u8,
        name: String, description: String, cost: u64, sku: String) -> Result<()> {
        let owner = &ctx.accounts.owner;
        let product = &mut ctx.accounts.product;    
        let mint_product_ref = &mut ctx.accounts.mint_product_ref;

        product.bump = *ctx.bumps.get("product").unwrap();
        product.product_id = _product_id;
        product.owner = owner.key();
        product.store = None;
        product.name = name;
        product.description = description;
        product.cost = cost;
        product.sku = sku;

        mint_product_ref.bump = *ctx.bumps.get("mint_product_ref").unwrap();
        mint_product_ref.product = product.key();

        Ok(())
    }

    pub fn create_store_product(ctx: Context<CreateStoreProduct>, _product_id: String, _decimals: u8,
                name: String, description: String, cost: u64, sku: String) -> Result<()> {
        let owner = &ctx.accounts.owner;
        let store = &mut ctx.accounts.store;
        let product = &mut ctx.accounts.product;    
        let mint_product_ref = &mut ctx.accounts.mint_product_ref;

        product.bump = *ctx.bumps.get("product").unwrap();
        product.product_id = _product_id;
        product.owner = owner.key();
        product.store = Some(store.key());
        product.name = name;
        product.description = description;
        product.cost = cost;
        product.sku = sku;
        
        mint_product_ref.bump = *ctx.bumps.get("mint_product_ref").unwrap();
        mint_product_ref.product = product.key();

        store.product_count += 1; 

        Ok(())
    }

    pub fn update_product(ctx: Context<UpdateProduct>, name: String, description: String, cost: u64, sku: String) -> Result<()> {
        let product = &mut ctx.accounts.product;
        product.name = name;
        product.description = description;
        product.cost = cost;
        product.sku = sku;

        Ok(())
    }

}


#[derive(Accounts)]
#[instruction(_store_id: String)]
pub struct CreateStore<'info> {
    #[account(init,
        payer=owner,
        space=8+STORE_SIZE, 
        seeds=[STORE_SEED_BYTES, _store_id.as_bytes()],
        bump)]
    pub store: Account<'info, Store>,

    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}


#[derive(Accounts)]
pub struct UpdateStore<'info> {
    #[account(mut, 
        has_one=owner,
        seeds=[STORE_SEED_BYTES, store.store_id.as_bytes()],
        bump = store.bump)]   
    pub store: Account<'info, Store>,

    #[account(mut)]
    pub owner: Signer<'info>,
}

//consider using metaplex for this.
#[derive(Accounts)]
#[instruction(_product_id: String, _decimals: u8)]
pub struct CreateStoreProduct<'info> {

    #[account(
        init,
        payer=owner,
        mint::decimals=_decimals,
        mint::authority=owner,
        mint::freeze_authority = owner,
    )]
    pub mint: Account<'info, Mint>, //mint account for this product. The owner mints tokens to the product_mint account for this program to use
  
    #[account(init,
        payer=owner,
        space=8+PRODUCT_SIZE, 
        seeds=[PRODUCT_SEED_BYTES, _product_id.as_bytes()], 
        bump)]
    pub product: Account<'info, Product>,

    #[account(init,
        payer=owner,
        seeds=[PRODUCT_MINT_SEED_BYTES, mint.key().as_ref()],
        bump,
        token::mint = mint,
        token::authority = twine_program, //this program will be transferring tokens out of this account
    )]
    pub product_mint: Account<'info, TokenAccount>,
  
    //for an issued token, this account can be derived, 
    //then the contained product pubkey gives the product account address.
      #[account(init,
        payer=owner,
        space=8+MINT_PRODUCT_REF_SIZE,
        seeds=[MINT_PRODUCT_REF_SEED_BYTES, mint.key().as_ref()], 
        bump)]
    pub mint_product_ref: Account<'info, MintProductRef>,

    #[account(mut @ ErrorCode::NotMutable,
        has_one=owner @ ErrorCode::IncorrectOwner, 
        seeds=[STORE_SEED_BYTES, store.store_id.as_bytes()],
        bump=store.bump)]
    pub store: Account<'info, Store>,
  
    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
    pub twine_program: Program<'info, crate::program::Twine>,
}

#[derive(Accounts)]
#[instruction(_product_id: String, _decimals: u8)]
pub struct CreateProduct<'info> {

    #[account(
        init,
        payer=owner,
        mint::decimals=_decimals,
        mint::authority=owner,
        mint::freeze_authority = owner,
    )]
    pub mint: Account<'info, Mint>, //mint account for this product. The owner mints tokens to the product_mint account for this program to use
  
    #[account(init,
        payer=owner,
        space=8+PRODUCT_SIZE, 
        seeds=[PRODUCT_SEED_BYTES, _product_id.as_bytes()], 
        bump)]
    pub product: Account<'info, Product>,

    #[account(init,
        payer=owner,
        seeds=[PRODUCT_MINT_SEED_BYTES, mint.key().as_ref()],
        bump,
        token::mint = mint,
        token::authority = twine_program, //this program will be transferring tokens out of this account
    )]
    pub product_mint: Account<'info, TokenAccount>,
  
    //for an issued token, this account can be derived, 
    //then the contained product pubkey gives the product account address.
      #[account(init,
        payer=owner,
        space=8+MINT_PRODUCT_REF_SIZE,
        seeds=[MINT_PRODUCT_REF_SEED_BYTES, mint.key().as_ref()], 
        bump)]
    pub mint_product_ref: Account<'info, MintProductRef>,
  
    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
    pub twine_program: Program<'info, crate::program::Twine>,
}

#[derive(Accounts)]
pub struct UpdateProduct<'info> {
    #[account(mut @ ErrorCode::NotMutable,
        has_one=owner @ ErrorCode::IncorrectOwner,
        seeds=[PRODUCT_SEED_BYTES, product.product_id.as_bytes()], 
        bump = product.bump
    )]
    pub product: Account<'info, Product>,

    #[account(mut)]
    pub owner: Signer<'info>
}




pub const STORE_SIZE: usize = 1 + 32 + 32 + 8 + (4+250) + (4+200);
#[account]
pub struct Store{
    pub bump: u8, //1; bump used for this PDA
    pub store_id: String, //32;
    pub owner: Pubkey, //32; current owner
    pub product_count: u64, //8; tracks product count.
    pub name: String, //4+250; store name
    pub description: String, //4+200; store description
   
    //pub verified_by: Option<Pubkey>, //1 + 32; If verified, verified by who? store this outside this account
    //pub rating: u8, //8; current rating; store this outside of the account
}


pub const PRODUCT_SIZE: usize = 1 + 32 + 32 + (1+32) +  8 + (4+250) + (4+200) + (4+25);
#[account]
pub struct Product{
    pub bump: u8, //1;
    pub product_id: String, //32;
    pub owner: Pubkey, //32; address allowed to make changes
    pub store: Option<Pubkey>, //1+32; address of store PDA
    pub cost: u64, //8;
    pub name: String, //4+250; product name
    pub description: String, //4+200; product description
    pub sku: String, //4+25; This gives the ability to relate the product to a sku in some catalog - not used natively
    //pub category: u64, //64; bitwise AND masked identifier    
    //pub verified_by: Option<Pubkey>, //1 + 8; store this outside of this account    
    //pub rating: u8, //8; current rating; store this outside of the account
}

//This will be used to look up a product by the mint
pub const MINT_PRODUCT_REF_SIZE: usize = 1 + 32;
#[account]
pub struct MintProductRef{
    pub bump: u8, //1;
    pub product: Pubkey, //32; product account
}

/// Used as a bitwise mask for the product category
/// this isn't a scalable way to store all the product categories - revisit this
#[repr(u64)]
pub enum ProductCategory{
    None = 0,
    Media = 1,
    Merch = 2,
    Event = 4,
    Social = 8,
}

/// Used as a bitwise mask for the product type
/// this isn't a scalable way to store all the product types - revisit this
#[repr(u64)]
pub enum ProductType {
    None = 0,
    Music = 1,
    Video = 2,
    Clothing = 4,
    Concert = 8,
    Conference = 16,
    Award = 32,
}


#[error_code]
pub enum ErrorCode {
    #[msg("PublicKeyMismatch")]
    PublicKeyMismatch,
    #[msg("InvalidMintAuthority")]
    InvalidMintAuthority,
    #[msg("UninitializedAccount")]
    UninitializedAccount,
    #[msg("IncorrectOwner")]
    IncorrectOwner,
    #[msg("StoreNumberDoesntMatchCompanyStoreCount")]
    StoreNumberDoesntMatchCompanyStoreCount,
    #[msg("NotMutable")]
    NotMutable,
}