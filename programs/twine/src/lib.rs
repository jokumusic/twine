use anchor_lang::prelude::*;


declare_id!("BKzDVQpoGW77U3ayBN6ELDbvEvSi2TYpSzHm8KhNmrCx");


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
        store.creator = ctx.accounts.payer.key();
        store.owner = ctx.accounts.owner.key();
        store.name = name;
        store.description = description;
        store.bump = *ctx.bumps.get("store").unwrap();

        Ok(())
    }

    pub fn update_store(ctx: Context<UpdateStore>, name: String, description: String) -> Result<()> {
        let store = &mut ctx.accounts.store;
        store.name = name;
        store.description = description;
        Ok(())
    }

    pub fn change_store_owner(ctx: Context<UpdateStore>) -> Result<()> {
        let store = &mut ctx.accounts.store;
        store.owner = ctx.accounts.owner.key();
        Ok(())
    }

}


#[derive(Accounts)]
pub struct CreateCompany<'info> {
    #[account(init, payer=payer, space=8+8+32+32, seeds=[b"company", owner.key.as_ref()], bump)]
    pub company: Account<'info, Company>,

    #[account(mut)]
    pub payer: Signer<'info>,

    /// CHECK: the owner is the pubkey that is allowed to modify the copany
    pub owner: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[account]
pub struct Company{
    pub bump: u8, //8;
    pub owner: Pubkey, //32;
    pub store_count: u32, //32;
}


#[derive(Accounts)]
pub struct CreateStore<'info> {
    #[account(init, payer=payer, space=8+522, seeds=[b"store", owner.key.as_ref()], bump)]
    pub store: Account<'info, Store>,

    #[account(mut)]
    pub payer: Signer<'info>,

    /// CHECK: this is is any account/pubkey that is authorized to modify the account. This is set by the payer on the initial creation
    pub owner: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}


#[derive(Accounts)]
pub struct UpdateStore<'info> {
    #[account(mut, has_one=owner, seeds=[b"store", owner.key.as_ref()], bump = store.bump)]   
    pub store: Account<'info, Store>,

    #[account()]
    pub owner: Signer<'info>,

    #[account(mut)]
    pub payer: Signer<'info>,
}

#[derive(Accounts)]
pub struct ChangeStoreOwner<'info> {
    #[account(mut, has_one=owner, seeds=[b"store", owner.key.as_ref()], bump = store.bump)]   
    pub store: Account<'info, Store>,

    #[account(mut)]
    pub owner: Signer<'info>,
}

/*
#[derive(Accounts)]
pub struct CreateProduct<'info> {
    #[account(init, payer=payer, space=8+1, seeds=[b"store", owner.key.as_ref()], bump)]
    pub store: Account<'info, Store>,

    #[account(mut)]
    pub payer: Signer<'info>,

    pub owner: UncheckedAccount<'info>,
    pub token_program: Program<'info, Token>,
}
*/

#[account]
pub struct Store{
    pub bump: u8, //8; bump used for this PDA
    pub creator: Pubkey, //32; original payer
    pub owner: Pubkey, //32; current owner
    pub name: String, //250; store name
    pub description: String, //200; store description
    //pub verified_by: Option<Pubkey>, //1 + 32; If verified, verified by who? store this outside this account
    //pub rating: u8, //8; current rating; store this outside of the account
}


#[account]
pub struct Product{
    pub creator: Pubkey, //32; original transaction signer
    pub owner: Pubkey, //32; address allowed to make changes
    pub store: Pubkey, //32; address of store PDA
    pub name: String, //250; product name
    pub description: String, //200; product description
    //pub category: u64, //64; bitwise AND masked identifier 
    pub cost: u64, //64;
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




