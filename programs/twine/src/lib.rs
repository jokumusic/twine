use anchor_lang::prelude::*;
use anchor_spl::token::{Token, TokenAccount, Mint};

declare_id!("GMfD6UaH9SCYv6xoT7Jb7X14L2TSQaJbtLGpdzU4f88P");

const COMPANY_SEED_BYTES : &[u8] ="company".as_bytes();
const STORE_SEED_BYTES : &[u8] ="store".as_bytes();
const PRODUCT_SEED_BYTES : &[u8] = "product".as_bytes();
const PRODUCT_MINT_SEED_BYTES : &[u8] = "product_mint".as_bytes();
const MINT_PRODUCT_REF_SEED_BYTES : &[u8] = "mint_product_ref".as_bytes();


#[program]
pub mod twine {
    use super::*;

    pub fn create_company(ctx: Context<CreateCompany>) -> Result<()>{
        let company = &mut ctx.accounts.company;
        company.bump = *ctx.bumps.get("company").unwrap();
        company.owner = ctx.accounts.owner.key();
        company.store_count = 0;

        Ok(())
    }


    pub fn create_store(ctx: Context<CreateStore>, name: String, description: String) -> Result<()> {
        let store = &mut ctx.accounts.store;
        let company = &mut ctx.accounts.company;

        store.bump = *ctx.bumps.get("store").unwrap();
        store.company = company.key();
        store.store_number = company.store_count;       
        store.owner = ctx.accounts.owner.key();
        store.name = name;
        store.description = description;        
        store.product_count = 0;

        company.store_count += 1;
        Ok(())
    }


    pub fn update_store(ctx: Context<UpdateStore>, _store_number: u32, name: String, description: String) -> Result<()> {
        let store = &mut ctx.accounts.store;
        store.name = name;
        store.description = description;
        Ok(())
    }


    pub fn create_product(ctx: Context<CreateProduct>, _store_number: u32,
                name: String, description: String, cost: u64, sku: String) -> Result<()> {
        
        let owner = &ctx.accounts.owner;
        let company = &ctx.accounts.company;
        let store = &mut ctx.accounts.store;
        let product = &mut ctx.accounts.product;    
        let mint_product_ref = &mut ctx.accounts.mint_product_ref;

        product.bump = *ctx.bumps.get("product").unwrap();
        product.product_number = store.product_count;
        product.owner = owner.key();
        product.company = company.key();
        product.store = store.key();
        product.name = name;
        product.description = description;
        product.cost = cost;
        product.sku = sku;
        
        mint_product_ref.bump = *ctx.bumps.get("mint_product_ref").unwrap();
        mint_product_ref.product = product.key();

        store.product_count += 1; 

        Ok(())
    }

}


#[derive(Accounts)]
pub struct CreateCompany<'info> {
    #[account(init,
        payer=owner,
        space=8+COMPANY_SIZE,
        seeds=[COMPANY_SEED_BYTES, owner.key.as_ref()],
        bump)]
    pub company: Account<'info, Company>,

    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}


#[derive(Accounts)]
pub struct CreateStore<'info> {
    #[account(init,
        payer=owner,
        space=8+STORE_SIZE, 
        seeds=[STORE_SEED_BYTES, owner.key.as_ref(), company.key().as_ref(), &company.store_count.to_be_bytes()],
        bump)]
    pub store: Account<'info, Store>,

    #[account(mut, has_one=owner, seeds=[COMPANY_SEED_BYTES, owner.key.as_ref()], bump=company.bump)]
    pub company: Account<'info, Company>,
    
    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}


#[derive(Accounts)]
#[instruction(_store_number: u32)]
pub struct UpdateStore<'info> {
    #[account(mut, 
        has_one=owner,
        seeds=[STORE_SEED_BYTES, owner.key.as_ref(), company.key().as_ref(), &_store_number.to_be_bytes()],
        bump = store.bump)]   
    pub store: Account<'info, Store>,

    #[account(seeds=[COMPANY_SEED_BYTES, owner.key.as_ref()], bump=company.bump)]
    pub company: Account<'info, Company>,

    #[account(mut)]
    pub owner: Signer<'info>,   
}

//consider using metaxplex for this.
#[derive(Accounts)]
#[instruction(_store_number: u32)]
pub struct CreateProduct<'info> {
    pub mint: Account<'info, Mint>, //mint account for this product. THe owner mints tokens to the product_mint account for this program to use
    
    #[account(init,
        payer=owner,
        space=8+PRODUCT_SIZE, 
        seeds=[
            PRODUCT_SEED_BYTES,
            owner.key.as_ref(),
            store.key().as_ref(),
            &store.product_count.to_be_bytes()
        ], bump)]
    pub product: Account<'info, Product>,

    #[account(init,
        payer=owner,
        seeds=[PRODUCT_MINT_SEED_BYTES, mint.key().as_ref()],
        bump,
        token::mint = mint,
        token::authority = program, //this program will be transferring tokens out of this account
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


    #[account(mut,
        has_one=owner, 
        seeds=[STORE_SEED_BYTES, owner.key.as_ref(), company.key().as_ref(), &_store_number.to_be_bytes()],
        bump=store.bump)]
    pub store: Account<'info, Store>,


    #[account(seeds=[COMPANY_SEED_BYTES, owner.key.as_ref()], bump=company.bump)]
    pub company: Account<'info, Company>,
  
    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
    pub program: Program<'info, program::Twine>,
}


pub const COMPANY_SIZE: usize = 8 + 32 + 32;
#[account]
pub struct Company{
    pub bump: u8, //8;
    pub owner: Pubkey, //32;
    pub store_count: u32, //32; tracks store count. used as part of seed for store PDA's
}


pub const STORE_SIZE: usize = 8 + 32 + 32 + 32 + 250 + 200 + 64;
#[account]
pub struct Store{
    pub bump: u8, //8; bump used for this PDA
    pub company: Pubkey, //32;
    pub store_number: u32, //32;
    pub owner: Pubkey, //32; current owner
    pub name: String, //250; store name
    pub description: String, //200; store description
    pub product_count: u64, //64; tracks product count. used as part of seed for product PDA's
    //pub verified_by: Option<Pubkey>, //1 + 32; If verified, verified by who? store this outside this account
    //pub rating: u8, //8; current rating; store this outside of the account
}


pub const PRODUCT_SIZE: usize = 8 + 64 + 32 + 32 + 32 + 250 + 200 + 64 + 25;
#[account]
pub struct Product{
    pub bump: u8, //8;
    pub product_number: u64, //64; keeps track of which product number this is out of the store.product_count
    pub owner: Pubkey, //32; address allowed to make changes
    pub company: Pubkey, //32; address of company PDA
    pub store: Pubkey, //32; address of store PDA  
    pub name: String, //250; product name
    pub description: String, //200; product description
    pub cost: u64, //64;
    pub sku: String, //25; This gives the ability to relate the product to a sku in some catalog - not used natively
    //pub category: u64, //64; bitwise AND masked identifier    
    //pub verified_by: Option<Pubkey>, //1 + 8; store this outside of this account    
    //pub rating: u8, //8; current rating; store this outside of the account
}

//This will be used to look up a product by the mint
pub const MINT_PRODUCT_REF_SIZE: usize = 8 + 32;
#[account]
pub struct MintProductRef{
    pub bump: u8, //8;
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
}