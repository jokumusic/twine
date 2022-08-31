use anchor_lang::{prelude::*, solana_program::clock::Clock};
use anchor_spl::{
    token::{ Token }
};


declare_id!("3ym4V8kf1RctdZw9PoSzZhqLCEQFN1UyWLUUZpqjFnPS");

const PROGRAM_VERSION: u8 = 0;
const STORE_VERSION : u8 = 0;
const PRODUCT_VERSION: u8 = 0;
const PRODUCT_SNAPSHOT_METADATA_VERSION: u8 = 0;
const PURCHASE_TICKET_VERSION: u8 = 0;

const PROGRAM_METADATA_BYTES: &[u8] = b"program_metadata";
const STORE_SEED_BYTES : &[u8] = b"store";
const PRODUCT_SEED_BYTES : &[u8] = b"product";
const PRODUCT_SNAPSHOT_METADATA_BYTES: &[u8] = b"product_snapshot_metadata";
const PRODUCT_SNAPSHOT_BYTES: &[u8] = b"product_snapshot";
const PURCHASE_TICKET_BYTES : &[u8] = b"purchase_ticket";
//const PRODUCT_MINT_BYTES : &[u8] = b"mint";


#[program]
pub mod twine {

    use super::*;
    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let program_metadata = &mut ctx.accounts.program_metadata;
        if program_metadata.initialized {
            return Err(ErrorCode::AlreadyInitialized.into());
        }

        program_metadata.bump = *ctx.bumps.get("program_metadata").unwrap();
        program_metadata.version = PROGRAM_VERSION;
        program_metadata.initialized = true;
        program_metadata.creator = ctx.accounts.creator.key();
        program_metadata.authority = ctx.accounts.authority.key();
        program_metadata.secondary_authority = ctx.accounts.secondary_authority.key();
        program_metadata.fee_account = ctx.accounts.fee_account.key();

        Ok(())
    }
    
    pub fn create_store(ctx: Context<CreateStore>, id: u16, status: u8, name: String, description: String, data: String) -> Result<()> {    
        let store = &mut ctx.accounts.store;

        if name.len() > STORE_NAME_SIZE {
            return Err(ErrorCode::NameIsTooLong.into());
        }

        if description.len() > STORE_DESCRIPTION_SIZE {
            return Err(ErrorCode::DescriptionIsTooLong.into());
        }
        
        store.bump = *ctx.bumps.get("store").unwrap();
        store.version = STORE_VERSION;
        store.status = status;
        store.creator =  ctx.accounts.creator.key();
        store.authority = ctx.accounts.authority.key(); 
        store.secondary_authority = ctx.accounts.secondary_authority.key();       
        store.id = id;
        store.tag = 0;
        store.product_count = 0;
        store.name = name;
        store.description = description;
        store.data = data;

        Ok(())
    }


    pub fn update_store(ctx: Context<UpdateStore>, name: String, description: String, data: String) -> Result<()> {
        let store = &mut ctx.accounts.store;

        if name.len() > STORE_NAME_SIZE {
            return Err(ErrorCode::NameIsTooLong.into());
        }

        if description.len() > STORE_DESCRIPTION_SIZE {
            return Err(ErrorCode::DescriptionIsTooLong.into());
        }

        store.name = name;
        store.description = description;
        store.data = data;

        Ok(())
    }


    pub fn create_product(ctx: Context<CreateProduct>, id: u32, status: u8, //_mint_decimals: u8,
        price: u64, inventory: u64, name: String, description: String, data: String) -> Result<()> {        
        let product = &mut ctx.accounts.product;

        if name.len() > PRODUCT_NAME_SIZE {
            return Err(ErrorCode::NameIsTooLong.into());
        }

        if description.len() > PRODUCT_DESCRIPTION_SIZE {
            return Err(ErrorCode::DescriptionIsTooLong.into());
        }

        product.bump = *ctx.bumps.get("product").unwrap();
        product.version = PRODUCT_VERSION;
        product.status = status;
        product.creator = ctx.accounts.creator.key();
        product.authority = ctx.accounts.authority.key();
        product.secondary_authority = ctx.accounts.secondary_authority.key();
        product.id = id;
        product.tag = 0;
        //product.mint = ctx.accounts.mint.key();
        product.pay_to = ctx.accounts.pay_to.key();
        product.store = None;
        product.price = price;
        product.inventory = inventory;
        product.name = name;
        product.description = description;
        product.data = data;

        Ok(())
    }

    pub fn create_store_product(ctx: Context<CreateStoreProduct>, id: u32, status: u8, //_mint_decimals: u8,
        price: u64, inventory: u64, name: String, description: String, data: String) -> Result<()> {
        
        let store = &mut ctx.accounts.store;
        let product = &mut ctx.accounts.product;

        if name.len() > PRODUCT_NAME_SIZE {
            return Err(ErrorCode::NameIsTooLong.into());
        }

        if description.len() > PRODUCT_DESCRIPTION_SIZE {
            return Err(ErrorCode::DescriptionIsTooLong.into());
        }

        product.bump = *ctx.bumps.get("product").unwrap();
        product.version = PRODUCT_VERSION;
        product.status = status;
        product.creator = ctx.accounts.creator.key();
        product.authority = ctx.accounts.authority.key();
        product.secondary_authority = ctx.accounts.secondary_authority.key();
        product.id = id;
        product.tag = 0;
        //product.mint = ctx.accounts.mint.key();
        product.pay_to = ctx.accounts.pay_to.key();
        product.store = Some(store.key());
        product.price = price;
        product.inventory = inventory;
        product.name = name;
        product.description = description;
        product.data = data;

        store.product_count += 1;

        Ok(())
    }

    pub fn update_product(ctx: Context<UpdateProduct>, status: u8, price: u64, inventory: u64, name: String, description: String, data: String) -> Result<()> {
        let product = &mut ctx.accounts.product;

        product.status = status;
        product.price = price;
        product.inventory = inventory;
        product.name = name;
        product.description = description;
        product.data = data;

        Ok(())
    }    

    //keep this simple for now, but look at including snapshots on purchases
    pub fn buy_product(ctx: Context<BuyProduct>, _nonce: u16,
         quantity: u64, agreed_price: u64) -> Result<()>{
        
        let product = &mut ctx.accounts.product;
        let buyer = &mut ctx.accounts.buyer;        
        let product_snapshot_metadata = &mut ctx.accounts.product_snapshot_metadata;
        let product_snapshot = &mut ctx.accounts.product_snapshot;
        let purchase_ticket = &mut ctx.accounts.purchase_ticket;
        let pay_to = &ctx.accounts.pay_to;
        let purchase_ticket_lamports = **purchase_ticket.to_account_info().try_borrow_lamports()?;
        let clock = Clock::get()?;
        let total_purchase_price = product.price * quantity;      
        
        if product.inventory < quantity {
            return Err(ErrorCode::NotEnoughInventory.into());
        }

        if product.price > agreed_price {
            return Err(ErrorCode::PriceIsGreaterThanPayment.into());
        }

        msg!("purchase ticket has {} lamports and total price is {} (quantity={}, price={})",
             purchase_ticket_lamports,
             total_purchase_price,
             quantity,
             product.price);

        if total_purchase_price > purchase_ticket_lamports {
            return Err(ErrorCode::InsufficientFunds.into());
        }        
            
        require_keys_eq!(pay_to.key(), product.pay_to.key());

        msg!("purchase_ticket lamports: {}, pay_to lamports: {}", 
        **purchase_ticket.to_account_info().try_borrow_lamports()?,
        **pay_to.to_account_info().try_borrow_lamports()?);

        let from = &mut purchase_ticket.to_account_info();
        let post_from = from
            .lamports()
            .checked_sub(total_purchase_price)
            .ok_or(ErrorCode::UnableToDeductFromBuyerAccount)?;
        let post_to = pay_to
            .lamports()
            .checked_add(total_purchase_price)
            .ok_or(ErrorCode::UnableToAddToPayToAccount)?;
        
        **from.try_borrow_mut_lamports().unwrap() = post_from;
        **pay_to.try_borrow_mut_lamports().unwrap() = post_to;

        msg!("remaining purchase_ticket lamports: {}, pay_to lamports: {}", 
            **purchase_ticket.to_account_info().try_borrow_lamports()?,
            **pay_to.to_account_info().try_borrow_lamports()?);


        product_snapshot_metadata.bump = *ctx.bumps.get("product_snapshot_metadata").unwrap();
        product_snapshot_metadata.version = PRODUCT_SNAPSHOT_METADATA_VERSION;
        product_snapshot_metadata.slot = clock.slot;
        product_snapshot_metadata.timestamp = clock.unix_timestamp;   
        product_snapshot_metadata.product = product.key();
        product_snapshot_metadata.product_snapshot =  product_snapshot.key();
        product_snapshot_metadata.nonce = _nonce;


        purchase_ticket.bump = *ctx.bumps.get("purchase_ticket").unwrap();
        purchase_ticket.version = PURCHASE_TICKET_VERSION;
        purchase_ticket.slot = clock.slot;
        purchase_ticket.timestamp = clock.unix_timestamp;
        purchase_ticket.product = product.key(); 
        purchase_ticket.product_snapshot_metadata = product_snapshot_metadata.key();
        purchase_ticket.product_snapshot = product_snapshot.key();        
        purchase_ticket.buyer = buyer.key();
        purchase_ticket.pay_to = pay_to.key();
        purchase_ticket.authority = ctx.accounts.buy_for.key(); 
        purchase_ticket.nonce = _nonce;
        purchase_ticket.quantity = quantity;
        purchase_ticket.redeemed = 0;        

        let product_clone = product.clone().into_inner();
        ctx.accounts.product_snapshot.set_inner(product_clone);
        ctx.accounts.product_snapshot.is_snapshot = true;

        product.inventory -= quantity;

        /*
        let token_program = ctx.accounts.token_program.to_account_info();
        let mint_to_accounts = MintTo {
            mint: ctx.accounts.mint.to_account_info(),
            to: ctx.accounts.buy_for.to_account_info(),
            authority: ctx.accounts.mint.to_account_info(),
        };
    
        let mint_bump = *ctx.bumps.get("mint").unwrap();

        mint_to(
            CpiContext::new_with_signer(
                token_program, 
                mint_to_accounts, 
                &[&[
                    PRODUCT_MINT_BYTES,
                    product.key().as_ref(),
                    &[mint_bump]
                ]]
            ), 
            quantity
        )?;
        */
       
        Ok(())
    }

}



#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(init,
        payer = creator,
        space = 8 + PROGRAM_METADATA_SIZE,
        seeds = [PROGRAM_METADATA_BYTES, creator.key().as_ref()],
        bump)]
    pub program_metadata: Account<'info, ProgramMetadata>,

    #[account(mut)]
    pub creator: Signer<'info>,

    /// CHECK:
    pub authority: AccountInfo<'info>,
    /// CHECK:
    pub secondary_authority: AccountInfo<'info>,
    /// CHECK:
    pub fee_account: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateProgramMetadata<'info> {
    #[account(
        mut,
        constraint= program_metadata.is_authorized(&authority.key),
        seeds= [PROGRAM_METADATA_BYTES, program_metadata.creator.key().as_ref()],
        bump= program_metadata.bump)]
    pub program_metadata: Account<'info, ProgramMetadata>,
    
    #[account(mut,
        constraint = program_metadata.is_authorized(&authority.key)
    )]
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(id: u16, status: u8, name: String, description: String, data: String)]
pub struct CreateStore<'info> {
    #[account(init,
        payer=creator,
        space=8 + STORE_SIZE + data.len(),
        seeds=[STORE_SEED_BYTES, creator.key().as_ref(), &id.to_be_bytes()],
        bump)]
    pub store: Box<Account<'info, Store>>,

    #[account(mut)]
    pub creator: Signer<'info>,

    /// CHECK: doesn't much need validation
    #[account(owner=system_program.key())]
    pub authority: AccountInfo<'info>,
     
    /// CHECK: doesn't much need validation
     #[account(owner=system_program.key())]
    pub secondary_authority: AccountInfo<'info>,
    
    pub system_program: Program<'info, System>,
}


#[derive(Accounts)]
#[instruction(name: String, description: String, data: String)]
pub struct UpdateStore<'info> {
    #[account(mut,
        constraint = store.is_authorized(&authority.key),
        realloc = 8 + STORE_SIZE + data.len(),
        realloc::payer = authority,
        realloc::zero = true,
        seeds=[STORE_SEED_BYTES, store.creator.key().as_ref(), &store.id.to_be_bytes()],
        bump = store.bump)]   
    pub store: Box<Account<'info, Store>>,

    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

//consider using metaplex for this.
#[derive(Accounts)]
#[instruction(id: u32, status: u8, //_mint_decimals: u8,
    price: u64, inventory: u64, name: String, description: String, data: String)]
pub struct CreateStoreProduct<'info> {
/*
    #[account(
        init,
        payer=creator,
        seeds=[PRODUCT_MINT_BYTES, product.key().as_ref()],
        bump,
        mint::decimals=_mint_decimals,
        mint::authority=mint, //dont give the owner this, or they could mint tokens without going through this program for validation
        mint::freeze_authority=mint,
    )]
    pub mint: Account<'info, Mint>, //mint account for this product. The owner mints tokens to the product_mint account for this program to use
  */
    #[account(init,
        payer=creator,
        space=8 + PRODUCT_SIZE + data.len(), 
        seeds=[PRODUCT_SEED_BYTES, creator.key().as_ref(), &id.to_be_bytes()], 
        bump)]
    pub product: Box<Account<'info, Product>>,

    #[account(mut,
        constraint = store.is_authorized(&creator.key),
        seeds=[STORE_SEED_BYTES, store.creator.key().as_ref(), &store.id.to_be_bytes()],
        bump=store.bump)]
    pub store: Box<Account<'info, Store>>,
  
    #[account(mut)]
    pub creator: Signer<'info>,

    /// CHECK: doesn't much need validation
    #[account(owner=system_program.key())]
    pub authority: AccountInfo<'info>,

    /// CHECK: doesn't much need validation
    #[account(owner=system_program.key())]
    pub secondary_authority: AccountInfo<'info>,

    /// CHECK: doesn't much need validation
    #[account(owner=system_program.key())]
    pub pay_to: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
#[instruction(id: u32, status: u8, //_mint_decimals: u8,
    price: u64, inventory: u64, name: String, description: String, data: String)]
pub struct CreateProduct<'info> {
/*
    #[account(
        init,
        payer=creator,
        seeds=[PRODUCT_MINT_BYTES, product.key().as_ref()],
        bump,
        mint::decimals=_mint_decimals,
        mint::authority=mint, //dont give the owner this, or they could mint tokens without going through this program for validation
        mint::freeze_authority=mint,
    )]
    pub mint: Account<'info, Mint>, //mint account for this product. The owner mints tokens to the product_mint account for this program to use
 */ 
    #[account(init,
        payer=creator,
        space=8 + PRODUCT_SIZE + data.len(), 
        seeds=[PRODUCT_SEED_BYTES, creator.key().as_ref(), &id.to_be_bytes()], 
        bump)]
    pub product: Box<Account<'info, Product>>,
  
    #[account(mut)]
    pub creator: Signer<'info>,

    /// CHECK: doesn't much need validation
    #[account(owner=system_program.key())]
    pub authority: AccountInfo<'info>,

    /// CHECK: doesn't much need validation
    #[account(owner=system_program.key())]
    pub secondary_authority: AccountInfo<'info>,

    /// CHECK: doesn't much need validation
    #[account(owner=system_program.key())]
    pub pay_to: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
#[instruction(status: u8, price: u64, inventory: u64, name: String, description: String, data: String)]
pub struct UpdateProduct<'info> {
    #[account(mut,
        constraint = product.is_authorized(&authority.key),
        realloc = 8 + PRODUCT_SIZE + data.len(),
        realloc::payer = authority,
        realloc::zero = true,
        has_one=authority,
        seeds=[PRODUCT_SEED_BYTES, product.creator.key().as_ref(), &product.id.to_be_bytes()],  
        bump = product.bump
    )]
    pub product: Box<Account<'info, Product>>,

    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}


#[derive(Accounts)]
#[instruction(_nonce: u16)]
pub struct BuyProduct<'info> {
    /*
    #[account(
        mut,
        seeds=[PRODUCT_MINT_BYTES, product.key().as_ref()],
        bump,
        address=product.mint.key()
    )]
    pub mint: Account<'info, Mint>,
    */

    #[account(
        mut,
        seeds=[PRODUCT_SEED_BYTES, product.creator.key().as_ref(), &product.id.to_be_bytes()], 
        bump=product.bump
    )]
    pub product: Box<Account<'info, Product>>,

    #[account(
        init,
        payer = buyer,
        space = 8 + PRODUCT_SNAPSHOT_METADATA_SIZE,
        seeds = [
            PRODUCT_SNAPSHOT_METADATA_BYTES,
            product.key().as_ref(),
            buyer.key().as_ref(),
            &_nonce.to_be_bytes()
        ],
        bump
    )]
    pub product_snapshot_metadata: Account<'info, ProductSnapshotMetadata>,

    #[account(
        init,
        payer = buyer,
        space = 8 + PRODUCT_SIZE + product.data.len(),
        seeds=[PRODUCT_SNAPSHOT_BYTES, product_snapshot_metadata.key().as_ref()], 
        bump
    )]
    pub product_snapshot: Box<Account<'info, Product>>,    


    #[account(
        init,
        payer = buyer,
        space = 8 + PURCHASE_TICKET_SIZE,
        //make nonce part of the seed, because in the future a new snapshot will only be created when a product changes
        seeds = [
            PURCHASE_TICKET_BYTES,
            product_snapshot_metadata.key().as_ref(),
            buyer.key().as_ref(),
            &_nonce.to_be_bytes()], 
        bump
    )]
    pub purchase_ticket: Account<'info, PurchaseTicket>,

    /// CHECK: doesn't much need validation
    #[account(
        mut,
        constraint=pay_to.key() == product.pay_to.key())
    ]
    pub pay_to: AccountInfo<'info>, //validate pay_to == product.pay_to
    
    #[account(mut)]
    pub buyer: Signer<'info>,

    //#[account(
        //init_if_needed,
        //payer = buyer,
        //associated_token::mint = mint,
        //associated_token::authority = buyer,

    /// CHECK: doesn't much need validation  
    #[account(owner=system_program.key())] 
    pub buy_for: AccountInfo<'info>,  //, TokenAccount>,

    pub system_program: Program<'info, System>,
    //pub token_program: Program<'info, Token>,
    //pub associated_token_program: Program<'info, AssociatedToken>,
    //pub rent: Sysvar<'info, Rent>,
    pub clock: Sysvar<'info, Clock>,
}


const PROGRAM_METADATA_SIZE: usize = 1 + 1 + 1 + 32 + 32 + 32 +32;
#[account]
pub struct ProgramMetadata {
    pub bump: u8, //1;
    pub initialized: bool, //1;
    pub version: u8, //1;
    pub creator: Pubkey, //32;
    pub authority: Pubkey, //32;
    pub secondary_authority: Pubkey, //32;
    pub fee_account: Pubkey, //32;
}


pub const STORE_NAME_SIZE: usize = 4+100;
pub const STORE_DESCRIPTION_SIZE: usize = 4+200;
pub const STORE_SIZE: usize = 1 + 1 + 1 + 32 + 32 + 32 + 2 + 8 + 8 + STORE_NAME_SIZE + STORE_DESCRIPTION_SIZE + 4;

#[account]
pub struct Store{
    pub bump: u8, //1; bump used for this PDA
    pub version: u8, //1; used for versioning schema, etc... to identify how to serialize/deserialize changes that may occur in the future
    pub status: u8, //1; can be used for various status: active, inactive, etc... better than a just an active/inactive boolean
    pub creator: Pubkey, //32; used as part of PDA seed to make it harder for spamming store creation
    pub authority: Pubkey, //32; authorized to make changes
    pub secondary_authority: Pubkey, //32; burner wallet or delegation...
    pub id: u16, //2; unique store id used as part of the PDA seed 
    pub tag: u64, //8; used for misc. tagging for simplifying queries. bitmasking maybe?
    pub product_count: u64, //8; tracks product count.
    pub name: String, //4+100; eventually used for indexing and querying
    pub description: String, //4+200; eventually used for indexing and querying    
    pub data: String, //4+ whatever size they pay for
    
    /* UNDECIDED STUFF */
    //pub category: u64, //64; bitwise AND masked identifier  
    //pub verified_by: Option<Pubkey>, //1 + 32; If verified, verified by who? store this outside this account
    //pub rating: u8, //8; current rating; store this outside of the account
    //pub version: u8, //1; version changes in data structure to provide decision making on serialization/deserialization
}



//pub const PRODUCT_SKU_SIZE: usize = 4+25;
pub const PRODUCT_NAME_SIZE: usize = 4+100;
pub const PRODUCT_DESCRIPTION_SIZE: usize = 4+200;
pub const PRODUCT_SIZE: usize = 1 + 1 + 1 + 32 + 32 + 32 + 4 + 8 + 1 + (1+32) + 32 + (1+32) + 8 + 8 +  PRODUCT_NAME_SIZE + PRODUCT_DESCRIPTION_SIZE + 4;

#[account]
pub struct Product{
    pub bump: u8, //1; bump used for this PDA
    pub version: u8, //1; used for versioning schema, etc... to identify how to serialize/deserialize changes that may occur in the future
    pub status: u8, //1; can be used for various status: active, inactive, etc... better than a just an active/inactive boolean
    pub creator: Pubkey, //32; used as part of PDA seed to make it harder for spamming store creation
    pub authority: Pubkey, //32; authorized to make changes
    pub secondary_authority: Pubkey, //32; burner wallet or delegation...
    pub id: u32, //4; unique store id used as part of the PDA seed 
    pub tag: u64, //8; used for misc. tagging for simplifying queries. bitmasking maybe?    
    pub is_snapshot: bool, //1;
    pub usable_snapshot: Option<Pubkey>, //1+32; set to None on product changes. On buys, if it's none, take a snapshot, otherwise use the existing snapshot
    //pub mint: Pubkey, //32; used to mint a product token to the buyer
    pub pay_to: Pubkey, //32; where payments should be sent. can be different than the authority
    pub store: Option<Pubkey>, //1+32; address of store PDA. maybe set to default Pubkey and save a byte?
    pub price: u64, //8; price of product. needs to be stable, but stablecoins can die, so most likely lamports since they'll be around as long as Solana is    
    pub inventory: u64, //8;
    pub name: String, //4+100; product name
    pub description: String, //4+200; product description  
    pub data: String, //4+ whatever size they pay for

    /* UNDECIDED STUFF */
    //pub sku: String, //4+25; This gives the ability to relate the product to a sku in some catalog - not used natively. most won't have this, store it in another account if needed
}

///help protect the seller and buyer from product changes
/// make sure to update sizes and fields as product changes. maybe just serialize and compress the whole thing?
/// it's more searchable when not compressed

const PRODUCT_SNAPSHOT_METADATA_SIZE: usize = 1 + 1 + 8 + 8 + 32 + 32 + 2;
#[account]
pub struct ProductSnapshotMetadata {
    pub bump: u8, //1;
    pub version: u8, //1;
    pub slot: u64, //8;
    pub timestamp: i64, //8; unixtimestamp
    pub product: Pubkey, //32; 
    pub product_snapshot: Pubkey, //32; pointer to snapshot
    pub nonce: u16, //2;
}

const PURCHASE_TICKET_SIZE: usize = 1 + 1 + 8 + 8 + 32 + 32 + 32 + 32 + 32 + 32 + 8 + 8 + 2;
#[account]
pub struct PurchaseTicket {
    pub bump: u8, //1;
    pub version: u8, //1; used for versioning schema, etc... to identify how to serialize/deserialize changes that may occur in the future
    pub slot: u64, //8;
    pub timestamp: i64, //8; unixtimestamp
    pub product: Pubkey, //32;
    pub product_snapshot_metadata: Pubkey, //32;
    pub product_snapshot: Pubkey, //32;
    pub buyer: Pubkey, //32;
    pub pay_to: Pubkey, //32;
    pub authority: Pubkey, //32;
    pub quantity: u64, //8;
    pub redeemed: u64, //8;
    pub nonce: u16, //2;
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
    #[msg("AlreadyInitialized")]
    AlreadyInitialized,
    #[msg("PublicKeyMismatch")]
    PublicKeyMismatch,
    #[msg("InvalidMintAuthority")]
    InvalidMintAuthority,
    #[msg("UninitializedAccount")]
    UninitializedAccount,
    #[msg("IncorrectAuthority")]
    IncorrectAuthority,
    #[msg("StoreNumberDoesntMatchCompanyStoreCount")]
    StoreNumberDoesntMatchCompanyStoreCount,
    #[msg("NotMutable")]
    NotMutable,
    #[msg("authority Doesn't Exist")]
    AuthorityDoesntExist,
    #[msg("pay_to Doesn't Exist")]
    PayToDoesntExist,
    #[msg("Price Is Greater Payment")]
    PriceIsGreaterThanPayment,
    #[msg("name is too long")]
    NameIsTooLong,
    #[msg("description is too long")]
    DescriptionIsTooLong,
    #[msg("not enough inventory")]
    NotEnoughInventory,
    #[msg("insufficient funds")]
    InsufficientFunds,
    #[msg("unable to deduct from buyer account")]
    UnableToDeductFromBuyerAccount,
    #[msg("unable to add to pay_to account")]
    UnableToAddToPayToAccount,
}

impl ProgramMetadata {
    fn is_authorized(&self, key: &Pubkey) -> bool {
        *key == self.authority || *key == self.secondary_authority
    }
}

impl Store {
    fn is_authorized(&self, key: &Pubkey) -> bool {
        *key == self.authority || *key == self.secondary_authority
    }
}

impl Product {
    fn is_authorized(&self, key: &Pubkey) -> bool {
        *key == self.authority || *key == self.secondary_authority
    }
}