use anchor_lang::prelude::*;
use anchor_spl::token::{Token, TokenAccount, Mint};

declare_id!("81U6fENzYDztW9NkpXomSXmGtAAF2bVqh5Z4CNbU7wJ5");

const METADATA_SEED_BYTES: &[u8] = "metadata".as_bytes();
const COMPANY_SEED_BYTES : &[u8] ="company".as_bytes();
const STORE_SEED_BYTES : &[u8] ="store".as_bytes();
const PRODUCT_SEED_BYTES : &[u8] = "product".as_bytes();
const PRODUCT_MINT_SEED_BYTES : &[u8] = "product_mint".as_bytes();
const MINT_PRODUCT_REF_SEED_BYTES : &[u8] = "mint_product_ref".as_bytes();

///
/// Using the total count of company, store or product as part of the seed for any account is dangerous
/// because once those numbers are reached, the program will stop working and new accounts can't be created
/// find another solution.
#[program]
pub mod twine {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let metadata = &mut ctx.accounts.metadata;
        metadata.bump = *ctx.bumps.get("metadata").unwrap();
        metadata.company_count = 0;
        Ok(())
    }

    pub fn create_company(ctx: Context<CreateCompany>) -> Result<()>{
        let company = &mut ctx.accounts.company;
        let metadata = &mut ctx.accounts.metadata;

        company.bump = *ctx.bumps.get("company").unwrap();
        company.company_number = metadata.company_count;
        company.owner = ctx.accounts.owner.key();
        company.store_count = 0;

        metadata.company_count += 1;

        Ok(())
    }


    pub fn create_store(ctx: Context<CreateStore>, _company_number: u32, name: String, description: String) -> Result<()> {
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


    pub fn update_store(ctx: Context<UpdateStore>, _company_number: u32, _store_number: u32, name: String, description: String) -> Result<()> {
        let store = &mut ctx.accounts.store;
        store.name = name;
        store.description = description;
        Ok(())
    }


    pub fn create_product(ctx: Context<CreateProduct>, _company_number: u32, _store_number: u32,  _decimals: u8,
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

    pub fn update_product(ctx: Context<UpdateProduct>, _company_number: u32, _store_number: u32, _product_number: u64,
        name: String, description: String, cost: u64, sku: String) -> Result<()> {

        let product = &mut ctx.accounts.product;
        product.name = name;
        product.description = description;
        product.cost = cost;
        product.sku = sku;

        Ok(())
    }

}


#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(init,
        payer = owner,
        space = 8+METADATA_SIZE,
        seeds = [METADATA_SEED_BYTES],
        bump)]
    pub metadata: Account<'info, MetaData>,

    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CreateCompany<'info> {
    #[account(init,
        payer=owner,
        space=8+COMPANY_SIZE,
        seeds=[COMPANY_SEED_BYTES, &metadata.company_count.to_be_bytes()],
        bump)]
    pub company: Account<'info, Company>,

    #[account(mut, seeds = [METADATA_SEED_BYTES], bump=metadata.bump)]
    pub metadata: Account<'info, MetaData>,

    #[account(mut)]
    pub owner: Signer<'info>,

    pub system_program: Program<'info, System>,
}


#[derive(Accounts)]
#[instruction(_company_number: u32)]
pub struct CreateStore<'info> {
    #[account(init,
        payer=owner,
        space=8+STORE_SIZE, 
        seeds=[STORE_SEED_BYTES, company.key().as_ref(), &company.store_count.to_be_bytes()],
        bump)]
    pub store: Account<'info, Store>,

    #[account(mut, has_one=owner, seeds=[COMPANY_SEED_BYTES, &_company_number.to_be_bytes()], bump=company.bump)]
    pub company: Account<'info, Company>,
    
    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}


#[derive(Accounts)]
#[instruction(_company_number: u32, _store_number: u32)]
pub struct UpdateStore<'info> {
    #[account(mut, 
        has_one=owner,
        seeds=[STORE_SEED_BYTES, company.key().as_ref(), &_store_number.to_be_bytes()],
        bump = store.bump)]   
    pub store: Account<'info, Store>,

    #[account(has_one=owner, seeds=[COMPANY_SEED_BYTES, &_company_number.to_be_bytes()], bump=company.bump)]
    pub company: Account<'info, Company>,

    #[account(mut)]
    pub owner: Signer<'info>,
}

//consider using metaxplex for this.
#[derive(Accounts)]
#[instruction(_company_number: u32, _store_number: u32,  _decimals: u8)]
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
        seeds=[
            PRODUCT_SEED_BYTES,
            store.key().as_ref(),
            &store.product_count.to_be_bytes()
        ], 
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
        seeds=[STORE_SEED_BYTES, company.key().as_ref(), &_store_number.to_be_bytes()],
        bump=store.bump)]
    pub store: Account<'info, Store>,


    #[account(has_one=owner @ ErrorCode::IncorrectOwner,
        seeds=[COMPANY_SEED_BYTES, &_company_number.to_be_bytes()],
        bump=company.bump)]
    pub company: Account<'info, Company>,
  
    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
    pub twine_program: Program<'info, crate::program::Twine>,
}

#[derive(Accounts)]
#[instruction(_company_number: u32, _store_number: u32, _product_number: u64)]
pub struct UpdateProduct<'info> {
    #[account(mut @ ErrorCode::NotMutable,
        has_one=owner @ ErrorCode::IncorrectOwner,
        seeds=[
            PRODUCT_SEED_BYTES,
            store.key().as_ref(),
            &_product_number.to_be_bytes()
        ], 
        bump = product.bump
    )]
    pub product: Account<'info, Product>,

    #[account(has_one=owner @ ErrorCode::IncorrectOwner, 
        seeds=[STORE_SEED_BYTES, company.key().as_ref(), &_store_number.to_be_bytes()],
        bump=store.bump)]
    pub store: Account<'info, Store>,

    #[account(has_one=owner @ ErrorCode::IncorrectOwner,
        seeds=[COMPANY_SEED_BYTES, &_company_number.to_be_bytes()],
        bump=company.bump)]
    pub company: Account<'info, Company>,

    #[account(mut)]
    pub owner: Signer<'info>
}




pub const METADATA_SIZE: usize = 1 + 4;
#[account]
pub struct MetaData {
    pub bump: u8, //1;
    pub company_count: u32, //4; //keep track of number of companies. 
}

pub const COMPANY_SIZE: usize = 1 + 4 + 32 + 4;
#[account]
pub struct Company{
    pub bump: u8, //1;
    pub company_number: u32, //4;
    pub owner: Pubkey, //32;    
    pub store_count: u32, //4; tracks store count. used as part of seed for store PDA's
}


pub const STORE_SIZE: usize = 1 + 32 + 32 + 4 + 8 + (4+250) + (4+200);
#[account]
pub struct Store{
    pub bump: u8, //1; bump used for this PDA
    pub company: Pubkey, //32;
    pub owner: Pubkey, //32; current owner
    pub store_number: u32, //4;
    pub product_count: u64, //8; tracks product count. used as part of seed for product PDA's
    pub name: String, //4+250; store name
    pub description: String, //4+200; store description
   
    //pub verified_by: Option<Pubkey>, //1 + 32; If verified, verified by who? store this outside this account
    //pub rating: u8, //8; current rating; store this outside of the account
}


pub const PRODUCT_SIZE: usize = 1 + 32 + 32 + 32 + 8 + 8 + (4+250) + (4+200) + (4+25);
#[account]
pub struct Product{
    pub bump: u8, //1;
    pub owner: Pubkey, //32; address allowed to make changes
    pub store: Pubkey, //32; address of store PDA  
    pub company: Pubkey, //32; address of company PDA
    pub cost: u64, //8;
    pub product_number: u64, //8; keeps track of which product number this is out of the store.product_count
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