use anchor_lang::prelude::*;


declare_id!("ow1FPwr4YunmzcYzCswCnhVqpEiD6H32zVJMSdRsi7Q");

const COMPANY_PREFIX_BYTES : &[u8] ="company".as_bytes();
const STORE_PREFIX_BYTES : &[u8] ="store".as_bytes();
//const PRODUCT_PREFIX : &[u8] = "product".as_bytes();

#[program]
pub mod twine {
    use super::*;

    pub fn create_company(ctx: Context<CreateCompany>) -> Result<()>{
        let company = &mut ctx.accounts.company;
        company.owner = ctx.accounts.owner.key();
        company.store_count = 0;
        company.bump = *ctx.bumps.get("company").unwrap();

        Ok(())
    }

    pub fn create_store(ctx: Context<CreateStore>, name: String, description: String) -> Result<()> {
        let store = &mut ctx.accounts.store;
        let company = &mut ctx.accounts.company;

        store.owner = ctx.accounts.owner.key();
        store.name = name;
        store.description = description;
        store.bump = *ctx.bumps.get("store").unwrap();
        store.store_number = company.store_count;
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

}


#[derive(Accounts)]
pub struct CreateCompany<'info> {
    #[account(init,
        payer=owner,
        space=8+COMPANY_STRUCT_SIZE,
        seeds=[COMPANY_PREFIX_BYTES, owner.key.as_ref()],
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
        space=8+STORE_STRUCT_SIZE, 
        seeds=[STORE_PREFIX_BYTES, owner.key.as_ref(), company.key().as_ref(), &company.store_count.to_be_bytes()],
        bump)]
    pub store: Account<'info, Store>,

    #[account(mut, has_one=owner, seeds=[COMPANY_PREFIX_BYTES, owner.key.as_ref()], bump=company.bump)]
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
        seeds=[STORE_PREFIX_BYTES, owner.key.as_ref(), company.key().as_ref(), &_store_number.to_be_bytes()],
        bump = store.bump)]   
    pub store: Account<'info, Store>,

    #[account(seeds=[COMPANY_PREFIX_BYTES, owner.key.as_ref()], bump=company.bump)]
    pub company: Account<'info, Company>,

    #[account(mut)]
    pub owner: Signer<'info>,   
}



pub const COMPANY_STRUCT_SIZE: usize = 8 + 32 + 32;
#[account]
pub struct Company{
    pub bump: u8, //8;
    pub owner: Pubkey, //32;
    pub store_count: u32, //32; tracks store count. used as part of seed for store PDA's
}


pub const STORE_STRUCT_SIZE: usize = 8 + 32 + 32 + 250 + 200 + 64;
#[account]
pub struct Store{
    pub bump: u8, //8; bump used for this PDA
    pub store_number: u32, //32;
    pub owner: Pubkey, //32; current owner
    pub name: String, //250; store name
    pub description: String, //200; store description
    pub product_count: u64, //64; tracks product count. used as part of seed for product PDA's
    //pub verified_by: Option<Pubkey>, //1 + 32; If verified, verified by who? store this outside this account
    //pub rating: u8, //8; current rating; store this outside of the account
}


pub const PRODUCT_STRUCT_SIZE: usize = 8 + 64 + 32 + 32 + 32 + 250 + 200 + 64;
#[account]
pub struct Product{
    pub bump: u8, //8;
    pub product_number: u64, //64; keeps track of which product number this is out of the store.product_count
    pub owner: Pubkey, //32; address allowed to make changes
    pub store: Pubkey, //32; address of store PDA   
    pub mint: Pubkey, //32; mint account for this product that will be used to mint tokens
    pub name: String, //250; product name
    pub description: String, //200; product description
    pub cost: u64, //64;
    pub sku: String, //25; This gives the ability to relate the product to a sku in some catalog - not used natively
    //pub category: u64, //64; bitwise AND masked identifier    
    //pub verified_by: Option<Pubkey>, //1 + 8; store this outside of this account    
    //pub rating: u8, //8; current rating; store this outside of the account
}

pub struct Issuance{
    pub issued_to: Pubkey, //32; originally issued_to
    pub owner: Pubkey, //32; current owner
    pub amount_paid: u64, //64; coins/tokens paid
    pub max_uses: Option<u64>, //1+64; how many times the purchase can be used
    pub expiration_date: u64, //64; minutes since 8/1/2022
    pub uses: u64, //64;
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