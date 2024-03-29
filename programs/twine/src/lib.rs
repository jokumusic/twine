use anchor_lang::{prelude::*, solana_program::clock::Clock};
use anchor_spl::{
    associated_token::AssociatedToken,
    token,
    token::{Token,TokenAccount,Mint},
};

declare_id!("GFyEm6g84oRmd156hPrJWsbWcsZaM4mhFf4654QgN5ae");

pub mod payment_token {
    use super::*;
    declare_id!("F6g9cmPtNAec9GYBF4s9vtX6hCE9eUxnFcv3bL8WsNuj");
}

//const TIME_OFFSET: u32 = 1641024000; //twine timestamp epoch is seconds since 2022-01-01. This is the number of seconds since unix timestamp 1970-01-01.

const PROGRAM_VERSION: u8 = 0;
const STORE_VERSION : u8 = 0;
const PRODUCT_VERSION: u8 = 0;
const PRODUCT_SNAPSHOT_METADATA_VERSION: u8 = 0;
const PURCHASE_TICKET_VERSION: u8 = 0;
const TICKET_TAKER_VERSION: u8 = 0;
const REDEMPTION_VERSION: u8 = 0;

const PROGRAM_METADATA_BYTES: &[u8] = b"program_metadata";
const STORE_SEED_BYTES : &[u8] = b"store";
const PRODUCT_SEED_BYTES : &[u8] = b"product";
const PRODUCT_SNAPSHOT_METADATA_BYTES: &[u8] = b"product_snapshot_metadata";
const PRODUCT_SNAPSHOT_BYTES: &[u8] = b"product_snapshot";
const PURCHASE_TICKET_BYTES : &[u8] = b"purchase_ticket";
const REDEMPTION_BYTES: &[u8] = b"redemption";
const PRODUCT_TAKER_BYTES: &[u8] = b"product_taker";
const STORE_TAKER_BYTES: &[u8] = b"store_taker";

//const PURCHASE_TRANSACTION_FEE: u64 = 10000; //.01; USDC token has 6 decimals
//const GENERAL_TRANSACTION_FEE: u64 = 5000000; //.005; SOL coin has 9 decimals


#[program]
pub mod twine {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, fee: u64) -> Result<()> {
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
        program_metadata.fee = fee;

        Ok(())
    }

    pub fn change_fee(ctx: Context<UpdateProgramMetadata>, fee: u64) -> Result<()> {
        ctx.accounts.program_metadata.fee = fee;        
        Ok(())
    }

    pub fn change_fee_account(ctx: Context<ChangeFeeAccount>) -> Result<()> {
        let program_metadata = &mut ctx.accounts.program_metadata;
        program_metadata.fee_account = ctx.accounts.fee_account.key();

        Ok(())
    }
    
    pub fn create_store(ctx: Context<CreateStore>, id: u16, status: u8, name: String, description: String, data: Vec<u8>) -> Result<()> {
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


    pub fn update_store(ctx: Context<UpdateStore>, status: u8, name: String, description: String, data: Vec<u8>) -> Result<()> {
        let store = &mut ctx.accounts.store;

        if name.len() > STORE_NAME_SIZE {
            return Err(ErrorCode::NameIsTooLong.into());
        }

        if description.len() > STORE_DESCRIPTION_SIZE {
            return Err(ErrorCode::DescriptionIsTooLong.into());
        }

        store.status = status;
        store.name = name;
        store.description = description;
        store.data = data;

        Ok(())
    }


    pub fn create_product(ctx: Context<CreateProduct>, id: u32, status: u8, price: u64, inventory: u64, redemption_type: u8,
        expiration_timestamp: i64, expiration_minutes_after_purchase: u32, expiration_minutes_after_redemption: u32,
        name: String, description: String, data: Vec<u8>) -> Result<()> {

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
        product.usable_snapshot = Pubkey::default();
        product.pay_to = ctx.accounts.pay_to.key();
        product.store = Pubkey::default();
        product.price = price;
        product.inventory = inventory;
        product.redemption_type = redemption_type;
        product.expiration_minutes_after_purchase = expiration_minutes_after_purchase;
        product.expiration_timestamp = expiration_timestamp;
        product.expiration_minutes_after_redemption = expiration_minutes_after_redemption;
        product.name = name;
        product.description = description;
        product.data = data;

        Ok(())
    }

    pub fn create_store_product(ctx: Context<CreateStoreProduct>, id: u32, status: u8, price: u64, inventory: u64, redemption_type: u8,
        expiration_timestamp: i64, expiration_minutes_after_purchase: u32, expiration_minutes_after_redemption: u32, 
        name: String, description: String, data: Vec<u8>) -> Result<()> {
        
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
        product.usable_snapshot = Pubkey::default();
        product.pay_to = ctx.accounts.pay_to.key();
        product.store = store.key();
        product.price = price;
        product.inventory = inventory;
        product.redemption_type = redemption_type;
        product.expiration_minutes_after_purchase = expiration_minutes_after_purchase;
        product.expiration_timestamp = expiration_timestamp;
        product.expiration_minutes_after_redemption = expiration_minutes_after_redemption;
        product.name = name;
        product.description = description;
        product.data = data;

        store.product_count += 1;

        Ok(())
    }

    pub fn update_product(ctx: Context<UpdateProduct>, status: u8, price: u64, inventory: u64, redemption_type: u8,
        expiration_timestamp: i64, expiration_minutes_after_purchase: u32, expiration_minutes_after_redemption: u32,
        name: String, description: String, data: Vec<u8>) -> Result<()> {
        let product = &mut ctx.accounts.product;
        
        if product.is_snapshot {
            return Err(ErrorCode::UnableToModifySnapshot.into());
        }

        if name.len() > PRODUCT_NAME_SIZE {
            return Err(ErrorCode::NameIsTooLong.into());
        }

        if description.len() > PRODUCT_DESCRIPTION_SIZE {
            return Err(ErrorCode::DescriptionIsTooLong.into());
        }

        product.status = status;
        product.price = price;
        product.redemption_type = redemption_type;
        product.inventory = inventory;
        product.expiration_minutes_after_purchase = expiration_minutes_after_purchase;
        product.expiration_timestamp = expiration_timestamp;
        product.expiration_minutes_after_redemption = expiration_minutes_after_redemption;
        product.name = name;
        product.description = description;
        product.data = data;

        Ok(())
    }    


    pub fn buy_product(ctx: Context<BuyProduct>, nonce: u16, quantity: u64,
        agreed_price: u64, agreed_expiration_timestamp: i64, agreed_expiration_minutes_after_purchase: u32, agreed_expiration_minutes_after_redemption: u32) -> Result<()>{
        
        let product = &mut ctx.accounts.product;
        let buyer = &mut ctx.accounts.buyer;
        let product_snapshot_metadata = &mut ctx.accounts.product_snapshot_metadata;
        let product_snapshot = &mut ctx.accounts.product_snapshot;
        let purchase_ticket = &mut ctx.accounts.purchase_ticket;
        let purchase_ticket_payment = &mut ctx.accounts.purchase_ticket_payment;
        let pay_to = &ctx.accounts.pay_to;
        let pay_to_token_account = &ctx.accounts.pay_to_token_account;
        let token_program = &ctx.accounts.token_program;
        let fee_token_account = &mut ctx.accounts.fee_token_account;
        let fee = ctx.accounts.program_metadata.fee;
        let clock = Clock::get()?;
        let total_purchase_price = product.price * quantity;
 
        if product.status != ProductStatus::ACTIVE {
            return Err(ErrorCode::ProductIsNotActive.into());
        }

        if product.inventory < quantity {
            return Err(ErrorCode::NotEnoughInventory.into());
        }

        if product.price > agreed_price {
            return Err(ErrorCode::PriceIsGreaterThanPayment.into());
        }

        //msg!("expiration: {}/{}, afterPurchase: {}/{}, afterRedemption: {}/{}", 
        //    product.expiration_timestamp, agreed_expiration_timestamp,
        //    product.expiration_minutes_after_purchase, agreed_expiration_minutes_after_purchase,
        //    product.expiration_minutes_after_redemption, agreed_expiration_minutes_after_redemption
        //);
        if product.expiration_timestamp != agreed_expiration_timestamp {
            return Err(ErrorCode::AgreedExpirationDoesntMatch.into())
        }

        if product.expiration_minutes_after_purchase != agreed_expiration_minutes_after_purchase {
            return Err(ErrorCode::AgreedExpirationAfterPurchaseDoesntMatch.into())
        }
        if product.expiration_minutes_after_redemption != agreed_expiration_minutes_after_redemption {
            return Err(ErrorCode::AgreedExpirationAfterRedemptionDoesntMatch.into())
        }

        if product.is_snapshot {
            return Err(ErrorCode::UnableToPurchaseSnapshot.into());
        }

        if product.expiration_timestamp > 0 && product.expiration_timestamp < clock.unix_timestamp {
            return Err(ErrorCode::ProductIsExpired.into());
        }
        
        if purchase_ticket_payment.amount < (total_purchase_price + fee) {
            return Err(ErrorCode::InsufficientFunds.into());
        }
   
        require_keys_eq!(pay_to.key(), product.pay_to.key());

        let purchase_ticket_seed_bump = *ctx.bumps.get("purchase_ticket").unwrap();
        let product_snapshot_metadata_key = product_snapshot_metadata.key();
        let buyer_key = buyer.key();
        let purchase_ticket_seeds = &[
            PURCHASE_TICKET_BYTES,
            product_snapshot_metadata_key.as_ref(),
            buyer_key.as_ref(),
            &nonce.to_be_bytes(),
            &[purchase_ticket_seed_bump]
        ];
        let payment_transfer_signer = &[&purchase_ticket_seeds[..]];       

        //fee transfer        
        let fee_transfer_accounts = anchor_spl::token::Transfer {
            from: purchase_ticket_payment.to_account_info(),
            to: fee_token_account.to_account_info(),
            authority: purchase_ticket.to_account_info(), //ata owned by twine program
        };

        let fee_transfer_cpicontext = CpiContext::new_with_signer(
    token_program.to_account_info(),
            fee_transfer_accounts,
            payment_transfer_signer,
        );

        let _fee_transfer_result = token::transfer(fee_transfer_cpicontext, fee)?;

        if product.redemption_type == RedemptionType::IMMEDIATE {  //release payment if redemption type is immediate

            let payment_transfer_accounts = anchor_spl::token::Transfer {
                from: purchase_ticket_payment.to_account_info(),
                to: pay_to_token_account .to_account_info(),
                authority: purchase_ticket.to_account_info(), //ata owned by twine program
            };

            let payment_transfer_cpicontext = CpiContext::new_with_signer(
                token_program.to_account_info(),
                payment_transfer_accounts,
                payment_transfer_signer,
            );

            let _payment_transfer_result = token::transfer(payment_transfer_cpicontext, product.price)?;
            
            purchase_ticket.redeemed = quantity;
            purchase_ticket.remaining_quantity = 0;
        }
        else {
            purchase_ticket.remaining_quantity = quantity;
            purchase_ticket.redeemed = 0;
        }

        product_snapshot_metadata.bump = *ctx.bumps.get("product_snapshot_metadata").unwrap();
        product_snapshot_metadata.version = PRODUCT_SNAPSHOT_METADATA_VERSION;
        product_snapshot_metadata.slot = clock.slot;
        product_snapshot_metadata.timestamp = clock.unix_timestamp;
        product_snapshot_metadata.product = product.key();
        product_snapshot_metadata.product_snapshot =  product_snapshot.key();
        product_snapshot_metadata.nonce = nonce;

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
        purchase_ticket.nonce = nonce;
        purchase_ticket.price = product.price;
        purchase_ticket.store = product.store;
        purchase_ticket.payment = purchase_ticket_payment.key();
        purchase_ticket.expiration_minutes_after_redemption = product.expiration_minutes_after_redemption;

        if product.expiration_minutes_after_purchase > 0 {
            purchase_ticket.expiration = clock.unix_timestamp + (i64::from(product.expiration_minutes_after_purchase) * 60);
        }

        if product.expiration_timestamp > 0 && (purchase_ticket.expiration == 0 || product.expiration_timestamp < purchase_ticket.expiration) {
            purchase_ticket.expiration = product.expiration_timestamp;
        }

        let product_clone = product.clone().into_inner();
        ctx.accounts.product_snapshot.set_inner(product_clone);
        ctx.accounts.product_snapshot.is_snapshot = true;

        product.inventory -= quantity;

        Ok(())
    }

    pub fn create_store_ticket_taker(ctx: Context<CreateStoreTicketTaker>) -> Result<()> {
        let clock = Clock::get()?;
        let ticket_taker = &mut ctx.accounts.ticket_taker;
    
        ticket_taker.bump = *ctx.bumps.get("ticket_taker").unwrap();
        ticket_taker.version = TICKET_TAKER_VERSION;
        ticket_taker.taker = ctx.accounts.taker.key();
        ticket_taker.entity_type = EntityType::STORE;
        ticket_taker.entity = ctx.accounts.store.key();
        ticket_taker.authorized_by = ctx.accounts.store_authority.key();
        ticket_taker.enabled_slot = clock.slot;
        ticket_taker.enabled_timestamp = clock.unix_timestamp;
        ticket_taker.disabled_slot = 0;
        ticket_taker.disabled_timestamp = 0;
    
        Ok(())
    }
    
    pub fn create_product_ticket_taker(ctx: Context<CreateProductTicketTaker>) -> Result<()> {
        let clock = Clock::get()?;
        let ticket_taker = &mut ctx.accounts.ticket_taker;
    
        ticket_taker.bump = *ctx.bumps.get("ticket_taker").unwrap();
        ticket_taker.version = TICKET_TAKER_VERSION;
        ticket_taker.taker = ctx.accounts.taker.key();
        ticket_taker.entity_type = EntityType::PRODUCT;
        ticket_taker.entity = ctx.accounts.product.key();
        ticket_taker.authorized_by = ctx.accounts.product_authority.key();
        ticket_taker.enabled_slot = clock.slot;
        ticket_taker.enabled_timestamp = clock.unix_timestamp;
        ticket_taker.disabled_slot = 0;
        ticket_taker.disabled_timestamp = 0;
    
        Ok(())
    }

    pub fn initiate_redemption(ctx: Context<InitiateRedemption>, nonce: u32, quantity: u64, take_expiration_minutes: u32) -> Result<()> {
        let clock = Clock::get()?;
        let purchase_ticket = &mut ctx.accounts.purchase_ticket;
        let purchase_ticket_payment = &ctx.accounts.purchase_ticket_payment;
        let total_purchase_price = purchase_ticket.price * quantity;
        
        if quantity <= 0 {
            return Err(ErrorCode::QuantityMustBeGreaterThanZero.into());
        }

        if quantity > purchase_ticket.remaining_quantity {
            return Err(ErrorCode::InsufficientRemainingRedemptions.into());
        }

        if purchase_ticket_payment.amount < total_purchase_price {
            return Err(ErrorCode::InsufficientFunds.into());
        }

        if purchase_ticket.expiration > 0 && purchase_ticket.expiration < clock.unix_timestamp {
            return Err(ErrorCode::TicketIsExpired.into());
        }

        let redemption = &mut ctx.accounts.redemption;
        redemption.bump = *ctx.bumps.get("redemption").unwrap();
        redemption.version = REDEMPTION_VERSION;        
        redemption.init_slot = clock.slot;
        redemption.init_timestamp = clock.unix_timestamp;
        redemption.close_slot=0;
        redemption.close_timestamp = 0;
        redemption.store = purchase_ticket.store;
        redemption.product = purchase_ticket.product;
        redemption.product_snapshot_metadata = purchase_ticket.product_snapshot_metadata;
        redemption.product_snapshot = purchase_ticket.product_snapshot;
        redemption.purchase_ticket = purchase_ticket.key();
        redemption.buyer = purchase_ticket.buyer;
        redemption.pay_to = purchase_ticket.pay_to;
        redemption.purchase_ticket_signer = ctx.accounts.purchase_ticket_authority.key();
        //redemption.purchase_ticket_remaining_quantity = purchase_ticket.remaining_quantity;
        redemption.redeem_quantity = quantity;
        redemption.price = purchase_ticket.price;
        redemption.status = RedemptionStatus::WAITING;
        redemption.nonce = nonce;

        if take_expiration_minutes > 0 {
            redemption.take_expiration = clock.unix_timestamp + (i64::from(take_expiration_minutes) * 60);
        }

        purchase_ticket.remaining_quantity -= quantity;
        purchase_ticket.pending_redemption += quantity;

        Ok(())
    }
    
    pub fn take_redemption(ctx: Context<TakeRedemption>) -> Result<()>{ 
        let clock = Clock::get()?;
        let purchase_ticket = &mut ctx.accounts.purchase_ticket;
        let purchase_ticket_payment = &ctx.accounts.purchase_ticket_payment;
        let pay_to_token_account = &ctx.accounts.pay_to_token_account;
        let token_program = &ctx.accounts.token_program;
        let ticket_taker = &ctx.accounts.ticket_taker;
        let redemption = &mut ctx.accounts.redemption;

        if redemption.ticket_taker != Pubkey::default() {
            return Err(ErrorCode::AlreadyRedeemed.into());
        }

        if redemption.close_slot > 0  {
            return Err(ErrorCode::AlreadyProcessed.into());
        }

        if purchase_ticket.expiration > 0 && purchase_ticket.expiration < clock.unix_timestamp {
            return Err(ErrorCode::TicketIsExpired.into());
        }

        if redemption.take_expiration > 0 && redemption.take_expiration < clock.unix_timestamp {
            return Err(ErrorCode::TakeIsExpired.into());
        }

        redemption.ticket_taker = ticket_taker.key();
        redemption.ticket_taker_signer = ctx.accounts.ticket_taker_signer.key(); 
        redemption.close_slot = clock.slot;
        redemption.close_timestamp = clock.unix_timestamp;
        redemption.status = RedemptionStatus::REDEEMED;


        if purchase_ticket.expiration_minutes_after_redemption > 0 {
            redemption.usage_expiration = clock.unix_timestamp + (i64::from(purchase_ticket.expiration_minutes_after_redemption) * 60);
        }

        let purchase_ticket_seed_bump = purchase_ticket.bump;
        let product_snapshot_metadata_key = purchase_ticket.product_snapshot_metadata;
        let buyer_key = purchase_ticket.buyer;
        let purchase_ticket_seeds = &[
            PURCHASE_TICKET_BYTES,
            product_snapshot_metadata_key.as_ref(),
            buyer_key.as_ref(),
            &purchase_ticket.nonce.to_be_bytes(), 
            &[purchase_ticket_seed_bump]
        ];
        let payment_transfer_signer = &[&purchase_ticket_seeds[..]];
  
        //payment transfer
        let payment_transfer_accounts = anchor_spl::token::Transfer {
            from: purchase_ticket_payment.to_account_info(),
            to: pay_to_token_account .to_account_info(),
            authority: purchase_ticket.to_account_info(), //ata owned by twine program
        };

        let payment_transfer_cpicontext = CpiContext::new_with_signer(
            token_program.to_account_info(),
            payment_transfer_accounts,
            payment_transfer_signer,
        );

        let _payment_transfer_result = token::transfer(payment_transfer_cpicontext, redemption.price * redemption.redeem_quantity)?;

        purchase_ticket.redeemed += redemption.redeem_quantity;
        purchase_ticket.pending_redemption -= redemption.redeem_quantity;

        Ok(())
    }

    pub fn cancel_redemption(ctx: Context<CancelRedemption>) -> Result<()> {        
        let clock = Clock::get()?;
        let purchase_ticket = &mut ctx.accounts.purchase_ticket;
        let redemption = &mut ctx.accounts.redemption;
        
        if redemption.status != RedemptionStatus::WAITING || redemption.close_timestamp > 0 {
            return Err(ErrorCode::AlreadyProcessed.into());
        }

        purchase_ticket.remaining_quantity += redemption.redeem_quantity;
        purchase_ticket.pending_redemption -= redemption.redeem_quantity;

        redemption.status = RedemptionStatus::CANCELLED;
        redemption.close_slot = clock.slot;
        redemption.close_timestamp = clock.unix_timestamp;

        Ok(())
    }

    pub fn transfer_ticket(ctx: Context<TransferTicket>, nonce: u16, quantity: u64) -> Result<()> {
        if quantity <= 0 {
            return Err(ErrorCode::QuantityMustBeGreaterThanZero.into());
        }

        if quantity > ctx.accounts.source_ticket.remaining_quantity {
            return Err(ErrorCode::InsufficientQuantity.into());
        }

        let clock = Clock::get()?;
        let source_ticket = &ctx.accounts.source_ticket;

        if source_ticket.expiration > 0 && source_ticket.expiration < clock.unix_timestamp {
            return Err(ErrorCode::TicketIsExpired.into());
        }
        
        let source_ticket_seed_bump = source_ticket.bump;
        let product_snapshot_metadata_key = source_ticket.product_snapshot_metadata;
        let buyer_key = source_ticket.buyer;
        let source_ticket_seeds = &[
            PURCHASE_TICKET_BYTES,
            product_snapshot_metadata_key.as_ref(),
            buyer_key.as_ref(),
            &source_ticket.nonce.to_be_bytes(),
            &[source_ticket_seed_bump]
        ];
        let payment_transfer_signer = &[&source_ticket_seeds[..]];
  
        let source_ticket_payment = &ctx.accounts.source_ticket_payment;
        let destination_ticket_payment = &ctx.accounts.destination_ticket_payment;

        //payment transfer
        let payment_transfer_accounts = anchor_spl::token::Transfer {
            from: source_ticket_payment.to_account_info(),
            to: destination_ticket_payment .to_account_info(),
            authority: source_ticket.to_account_info(),
        };

        let payment_transfer_cpicontext = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            payment_transfer_accounts,
            payment_transfer_signer,
        );

        let _payment_transfer_result = token::transfer(payment_transfer_cpicontext, source_ticket.price * quantity)?;

        ctx.accounts.destination_ticket.set_inner(ctx.accounts.source_ticket.clone().into_inner());
        let clock = Clock::get()?;
        let destination_ticket = &mut ctx.accounts.destination_ticket;
        destination_ticket.bump = *ctx.bumps.get("destination_ticket").unwrap();
        destination_ticket.nonce = nonce;        
        destination_ticket.slot = clock.slot;
        destination_ticket.timestamp = clock.unix_timestamp;
        destination_ticket.buyer = ctx.accounts.source_ticket_authority.key();
        destination_ticket.authority = ctx.accounts.destination_ticket_authority.key();
        destination_ticket.remaining_quantity = quantity;
        destination_ticket.redeemed = 0;
        destination_ticket.pending_redemption = 0;
        destination_ticket.payment = ctx.accounts.destination_ticket_payment.key();

        ctx.accounts.source_ticket.remaining_quantity -= quantity;

        Ok(())
    }

    pub fn cancel_ticket(ctx: Context<CancelTicket>, quantity: u64) -> Result<()> {
        let ticket = &mut ctx.accounts.ticket;
        
        if quantity > ticket.remaining_quantity {
            return Err(ErrorCode::InsufficientQuantity.into());
        }

        let ticket_seed_bump = ticket.bump;
        let product_snapshot_metadata_key = ticket.product_snapshot_metadata;
        let buyer_key = ticket.buyer;
        let ticket_seeds = &[
            PURCHASE_TICKET_BYTES,
            product_snapshot_metadata_key.as_ref(),
            buyer_key.as_ref(),
            &ticket.nonce.to_be_bytes(),
            &[ticket_seed_bump]
        ];
        let payment_transfer_signer = &[&ticket_seeds[..]];
  
        let ticket_payment = &ctx.accounts.ticket_payment;

        //payment transfer
        let payment_transfer_accounts = anchor_spl::token::Transfer {
            from: ticket_payment.to_account_info(),
            to: ctx.accounts.payment_return.to_account_info(),
            authority: ticket.to_account_info(),
        };

        let payment_transfer_cpicontext = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            payment_transfer_accounts,
            payment_transfer_signer,
        );

        let _payment_transfer_result = token::transfer(payment_transfer_cpicontext, ticket.price * quantity)?;

        ticket.remaining_quantity -= quantity;
        ctx.accounts.product.inventory += quantity;

        Ok(())
    }


}




#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(init,
        payer = creator,
        space = 8 + PROGRAM_METADATA_SIZE,
        seeds = [PROGRAM_METADATA_BYTES],
        bump)]
    pub program_metadata: Account<'info, ProgramMetadata>,

    #[account(mut)]
    pub creator: Signer<'info>,

    /// CHECK:
    pub authority: AccountInfo<'info>,
    /// CHECK:
    pub secondary_authority: AccountInfo<'info>,
    /// CHECK:
    #[account(owner=anchor_lang::system_program::ID)]
    pub fee_account: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateProgramMetadata<'info> {
    #[account(
        mut,
        constraint= program_metadata.is_authorized(&authority.key),
        seeds = [PROGRAM_METADATA_BYTES],
        bump= program_metadata.bump)]
    pub program_metadata: Account<'info, ProgramMetadata>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
}


#[derive(Accounts)]
pub struct ChangeFeeAccount<'info> {

    #[account(
        mut,
        //has_one=authority,
        seeds = [PROGRAM_METADATA_BYTES],
        bump=program_metadata.bump
    )]
    pub program_metadata: Account<'info, ProgramMetadata>,

    #[account(mut)]
    pub authority: Signer<'info>,

    /// CHECK:
    #[account(owner = anchor_lang::system_program::ID)]
    pub fee_account: AccountInfo<'info>,
}


#[derive(Accounts)]
#[instruction(id: u16, status: u8, name: String, description: String, data: Vec<u8>)]
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
    #[account()]
    pub authority: AccountInfo<'info>,
     
    /// CHECK: doesn't much need validation
     #[account()]
    pub secondary_authority: AccountInfo<'info>,
    
    pub system_program: Program<'info, System>,
}


#[derive(Accounts)]
#[instruction(status: u8, name: String, description: String, data: Vec<u8>)]
pub struct UpdateStore<'info> {
    #[account(mut,
        constraint = store.is_authorized(&authority.key),
        realloc = 8 + STORE_SIZE + data.len(),
        realloc::payer = authority,
        realloc::zero = true,
        seeds=[STORE_SEED_BYTES, store.creator.as_ref(), &store.id.to_be_bytes()],
        bump = store.bump)]   
    pub store: Box<Account<'info, Store>>,

    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

//consider using metaplex for this.
#[derive(Accounts)]
#[instruction(id: u32, status: u8, //_mint_decimals: u8,
    price: u64, inventory: u64, redemption_type: u8,
    expiration_timestamp: i64, expiration_minutes_after_purchase: u32, expiration_minutes_after_redemption: u32,
    name: String, description: String, data: Vec<u8>)]
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
        seeds=[STORE_SEED_BYTES, store.creator.as_ref(), &store.id.to_be_bytes()],
        bump=store.bump)]
    pub store: Box<Account<'info, Store>>,
  
    #[account(mut)]
    pub creator: Signer<'info>,

    /// CHECK: doesn't much need validation
    #[account()]
    pub authority: AccountInfo<'info>,

    /// CHECK: doesn't much need validation
    #[account()]
    pub secondary_authority: AccountInfo<'info>,

    /// CHECK: doesn't much need validation
    #[account(owner=anchor_lang::system_program::ID)]
    pub pay_to: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
#[instruction(id: u32, status: u8,
    price: u64, inventory: u64, redemption_type: u8,
    expiration_timestamp: i64, expiration_minutes_after_purchase: u32, expiration_minutes_after_redemption: u32,
    name: String, description: String, data: Vec<u8>)]
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
    #[account()]
    pub authority: AccountInfo<'info>,

    /// CHECK: doesn't much need validation
    #[account()]
    pub secondary_authority: AccountInfo<'info>,

    /// CHECK: doesn't much need validation
    #[account(owner=anchor_lang::system_program::ID)]
    pub pay_to: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
#[instruction(status: u8, price: u64, inventory: u64, redemption_type: u8,
    expiration_timestamp: i64, expiration_minutes_after_purchase: u32, expiration_minutes_after_redemption: u32,
    name: String, description: String, data: Vec<u8>)]
pub struct UpdateProduct<'info> {
    #[account(mut,
        constraint = product.is_authorized(&authority.key),
        realloc = 8 + PRODUCT_SIZE + data.len(),
        realloc::payer = authority,
        realloc::zero = true,
        //has_one=authority,
        seeds=[PRODUCT_SEED_BYTES, product.creator.as_ref(), &product.id.to_be_bytes()],  
        bump = product.bump
    )]
    pub product: Box<Account<'info, Product>>,

    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}


#[derive(Accounts)]
#[instruction(nonce: u16, quantity: u64, agreed_price: u64,
    agreed_expiration_timestamp: i64, agreed_expiration_minutes_after_purchase: u32, agreed_expiration_minutes_after_redemption: u32)]
pub struct BuyProduct<'info> {

    #[account(
        mut,
        seeds=[PRODUCT_SEED_BYTES, product.creator.as_ref(), &product.id.to_be_bytes()], 
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
            &nonce.to_be_bytes()
        ],
        bump
    )]
    pub product_snapshot_metadata: Box<Account<'info, ProductSnapshotMetadata>>,

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
            &nonce.to_be_bytes()], 
        bump
    )]
    pub purchase_ticket: Box<Account<'info, PurchaseTicket>>,

    #[account(
        mut,
        token::mint = purchase_ticket_payment_mint,
        token::authority = purchase_ticket,
    )]
    pub purchase_ticket_payment: Account<'info, TokenAccount>,

    #[account(address = crate::payment_token::ID)]
    pub purchase_ticket_payment_mint: Account<'info, Mint>,

    #[account(
        //init_if_needed,
        //payer=buyer,
        mut,
        token::mint = purchase_ticket_payment_mint,
        token::authority = pay_to,
    )]
    pub pay_to_token_account: Account<'info, TokenAccount>,

    /// CHECK: we good
    #[account(address = product.pay_to)]
    pub pay_to: AccountInfo<'info>,
   
    #[account(mut)]
    pub buyer: Signer<'info>,

    /// CHECK: doesn't much need validation  
    #[account(owner=system_program.key())] 
    pub buy_for: AccountInfo<'info>,

    #[account(seeds = [PROGRAM_METADATA_BYTES], bump=program_metadata.bump)]
    pub program_metadata: Box<Account<'info, ProgramMetadata>>,

    #[account(
        mut,
        token::mint = purchase_ticket_payment_mint,
        token::authority = fee_account,
    )]
    pub fee_token_account: Account<'info, TokenAccount>,

    /// CHECK:
    #[account(address = program_metadata.fee_account)]
    pub fee_account: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct CreateStoreTicketTaker<'info> {

    #[account(
        init,
        payer=store_authority,
        space = 8 + TICKET_TAKER_SIZE,
        seeds = [STORE_TAKER_BYTES, store.key().as_ref(), taker.key().as_ref()],
        bump
    )]
    pub ticket_taker: Account<'info, TicketTaker>,

    ///CHECK: any account with a signer can be authorized by the store_authority
    pub taker: AccountInfo<'info>,

    #[account(
        constraint = store.is_authorized(&store_authority.key),
        seeds=[STORE_SEED_BYTES, store.creator.as_ref(), &store.id.to_be_bytes()],
        bump=store.bump
    )]
    pub store: Account<'info, Store>,

    #[account(mut)]
    pub store_authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CreateProductTicketTaker<'info> {

    #[account(
        init,
        payer=product_authority,
        space = 8 + TICKET_TAKER_SIZE,
        seeds = [PRODUCT_TAKER_BYTES, product.key().as_ref(), taker.key().as_ref()],
        bump
    )]
    pub ticket_taker: Account<'info, TicketTaker>,

    ///CHECK: any account with a signer can be authorized by the store_authority
    pub taker: AccountInfo<'info>,

    #[account(
        constraint = product.is_authorized(&product_authority.key),
        seeds=[PRODUCT_SEED_BYTES, product.creator.as_ref(), &product.id.to_be_bytes()],
        bump=product.bump
    )]
    pub product: Account<'info, Product>,

    #[account(mut)]
    pub product_authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(nonce: u32, quantity: u64, take_expiration_minutes: u32)]
pub struct InitiateRedemption<'info> {

   #[account(
        init,
        payer = purchase_ticket_authority,
        space = 8 + REDEMPTION_SIZE,
        seeds = [REDEMPTION_BYTES, purchase_ticket.key().as_ref(), &nonce.to_be_bytes()],
        bump
    )]
    pub redemption: Box<Account<'info, Redemption>>,

    #[account(
        mut,
        seeds = 
        [
            PURCHASE_TICKET_BYTES,
            purchase_ticket.product_snapshot_metadata.as_ref(),
            purchase_ticket.buyer.as_ref(),
            &purchase_ticket.nonce.to_be_bytes()
        ], 
        bump = purchase_ticket.bump,
        constraint = purchase_ticket.authority == purchase_ticket_authority.key()
    )]
    pub purchase_ticket: Box<Account<'info, PurchaseTicket>>,

    #[account(mut)]
    pub purchase_ticket_authority: Signer<'info>,

    #[account(
        token::mint = purchase_ticket_payment_mint,
        token::authority = purchase_ticket,
    )]
    pub purchase_ticket_payment: Account<'info, TokenAccount>,

    #[account(address = crate::payment_token::ID)]
    pub purchase_ticket_payment_mint: Account<'info, Mint>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct TakeRedemption<'info> {

    #[account(
        mut,
        seeds = 
        [
            PURCHASE_TICKET_BYTES,
            purchase_ticket.product_snapshot_metadata.as_ref(),
            purchase_ticket.buyer.as_ref(),
            &purchase_ticket.nonce.to_be_bytes()
        ],
        bump = purchase_ticket.bump,
    )]
    pub purchase_ticket: Box<Account<'info, PurchaseTicket>>,

    #[account(
        mut,
        seeds = [REDEMPTION_BYTES, purchase_ticket.key().as_ref(), &redemption.nonce.to_be_bytes()],
        bump = redemption.bump
    )]
    pub redemption: Box<Account<'info, Redemption>>,

    #[account(
        constraint = ticket_taker.entity == redemption.product || ticket_taker.entity == redemption.store @ ErrorCode::InvalidTicketTaker
    )]
    pub ticket_taker: Box<Account<'info, TicketTaker>>,

    #[account(
        mut,
        constraint = ticket_taker_signer.key() == ticket_taker.taker @ ErrorCode::InvalidTicketTakerSigner
    )]
    pub ticket_taker_signer: Signer<'info>,

    #[account(
        mut,
        token::mint = purchase_ticket_payment_mint,
        token::authority = purchase_ticket,
    )]
    pub purchase_ticket_payment: Account<'info, TokenAccount>,

    #[account(address = crate::payment_token::ID)]
    pub purchase_ticket_payment_mint: Account<'info, Mint>,

    #[account(
        mut,
        token::mint = purchase_ticket_payment_mint,
        token::authority = pay_to,
    )]
    pub pay_to_token_account: Account<'info, TokenAccount>,

    /// CHECK: we good
    #[account(address = redemption.pay_to)]
    pub pay_to: AccountInfo<'info>,
    pub token_program: Program<'info, Token>,
}


#[derive(Accounts)]
pub struct CancelRedemption<'info> {
    #[account(
        mut,
        close = purchase_ticket_authority,
        seeds = [REDEMPTION_BYTES, purchase_ticket.key().as_ref(), &redemption.nonce.to_be_bytes()],
        bump = redemption.bump,
        constraint = redemption.purchase_ticket == purchase_ticket.key()
    )]
    pub redemption: Box<Account<'info, Redemption>>,

    #[account(
        mut,
        seeds = 
        [
            PURCHASE_TICKET_BYTES,
            purchase_ticket.product_snapshot_metadata.as_ref(),
            purchase_ticket.buyer.as_ref(),
            &purchase_ticket.nonce.to_be_bytes()
        ], 
        bump = purchase_ticket.bump,
        constraint = purchase_ticket.authority == purchase_ticket_authority.key()
    )]
    pub purchase_ticket: Box<Account<'info, PurchaseTicket>>,

    #[account(mut)]
    pub purchase_ticket_authority: Signer<'info>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
#[instruction(nonce: u16, quantity: u64)]
pub struct TransferTicket<'info> {

    #[account(
        init,
        payer = source_ticket_authority,
        space = 8 + PURCHASE_TICKET_SIZE,
        seeds = [
            PURCHASE_TICKET_BYTES,
            source_ticket.product_snapshot_metadata.as_ref(),
            source_ticket_authority.key().as_ref(),
            &nonce.to_be_bytes()],
        bump
    )]
    pub destination_ticket: Box<Account<'info, PurchaseTicket>>,

    #[account(
        init,
        payer = source_ticket_authority,
        associated_token::mint = payment_mint,
        associated_token::authority = destination_ticket
    )]
    pub destination_ticket_payment: Account<'info, TokenAccount>,
  
    /// CHECK: owner of the new ticket
    #[account()]
    pub destination_ticket_authority: AccountInfo<'info>,

    #[account(
        mut,
        seeds = [
            PURCHASE_TICKET_BYTES,
            source_ticket.product_snapshot_metadata.as_ref(),
            source_ticket.buyer.as_ref(),
            &source_ticket.nonce.to_be_bytes()],
        bump = source_ticket.bump,
        constraint = source_ticket.authority == source_ticket_authority.key())]
    pub source_ticket: Box<Account<'info, PurchaseTicket>>,

    #[account(
        mut,
        token::mint = payment_mint,
        token::authority = source_ticket,
        address = source_ticket.payment
    )]
    pub source_ticket_payment: Account<'info, TokenAccount>,
  
    #[account(address = crate::payment_token::ID)]
    pub payment_mint: Account<'info, Mint>,

    #[account(mut)]
    pub source_ticket_authority: Signer<'info>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct CancelTicket<'info> {

    #[account(
        mut,
        address = ticket.product,
    )]
    pub product: Box<Account<'info, Product>>,

    #[account(
        mut,
        seeds = [
            PURCHASE_TICKET_BYTES,
            ticket.product_snapshot_metadata.as_ref(),
            ticket.buyer.as_ref(),
            &ticket.nonce.to_be_bytes()],
        bump = ticket.bump,
        constraint = ticket.authority == ticket_authority.key())]
    pub ticket: Box<Account<'info, PurchaseTicket>>,

    #[account(
        mut,
        token::mint = payment_mint,
        token::authority = ticket,
        address = ticket.payment
    )]
    pub ticket_payment: Account<'info, TokenAccount>,

    #[account(
        mut,
        token::mint = payment_mint,
    )]
    pub payment_return: Account<'info, TokenAccount>,
  
    #[account(address = crate::payment_token::ID)]
    pub payment_mint: Account<'info, Mint>,    

    #[account(mut)]
    pub ticket_authority: Signer<'info>,
    pub token_program: Program<'info, Token>,
}


const PROGRAM_METADATA_SIZE: usize = 1 + 1 + 1 + 32 + 32 + 32 +32 + 8;
#[account]
pub struct ProgramMetadata {
    pub bump: u8, //1;
    pub initialized: bool, //1;
    pub version: u8, //1;
    pub creator: Pubkey, //32;
    pub authority: Pubkey, //32;
    pub secondary_authority: Pubkey, //32;
    pub fee_account: Pubkey, //32;
    pub fee: u64, //8;
}


pub const STORE_NAME_SIZE: usize = 100;
pub const STORE_DESCRIPTION_SIZE: usize = 200;
pub const STORE_SIZE: usize = 1 + 1 + 1 + 32 + 32 + 32 + 2 + 8 + 8 + (4+STORE_NAME_SIZE) + (4+STORE_DESCRIPTION_SIZE) + 4;

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
    pub data: Vec<u8>, //4+ whatever size they pay for
    
    /* UNDECIDED STUFF */
    //pub category: u64, //64; bitwise AND masked identifier  
    //pub verified_by: Option<Pubkey>, //1 + 32; If verified, verified by who? store this outside this account
    //pub rating: u8, //8; current rating; store this outside of the account
    //pub version: u8, //1; version changes in data structure to provide decision making on serialization/deserialization
}



//pub const PRODUCT_SKU_SIZE: usize = 4+25;
pub const PRODUCT_NAME_SIZE: usize = 100;
pub const PRODUCT_DESCRIPTION_SIZE: usize = 200;
pub const PRODUCT_SIZE: usize = 1 + 1 + 1 + 32 + 32 + 32 + 4 + 8 + 1 + 32 + 32 + 32 + 8 + 8 + 1 + 8 + 4 + 4 + (4+PRODUCT_NAME_SIZE) + (4+PRODUCT_DESCRIPTION_SIZE) + 4;

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
    pub usable_snapshot: Pubkey, //32; default to all zeros for none. Option<> doesn't work. On buys, if it's none, take a snapshot, otherwise use the existing snapshot
    //pub mint: Pubkey, //32; used to mint a product token to the buyer
    pub pay_to: Pubkey, //32; where payments should be sent. can be different than the authority
    pub store: Pubkey, //32; address of store PDA. maybe set to default Pubkey and save a byte?
    pub price: u64, //8; price of product. needs to be stable, but stablecoins can die, so most likely lamports since they'll be around as long as Solana is
    pub inventory: u64, //8;
    pub redemption_type: u8, //1;
    pub expiration_timestamp: i64, //8    
    pub expiration_minutes_after_purchase: u32, //4;
    pub expiration_minutes_after_redemption: u32, //4;    
    pub name: String, //4+100; product name
    pub description: String, //4+200; product description
    pub data: Vec<u8>, //4+ whatever size they pay for

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

const PURCHASE_TICKET_SIZE: usize = 1 + 1 + 8 + 8 + 32 + 32 + 32 + 32 + 32 + 32 + 8 + 8 + 8 + 2 + 8 + 32 + 32 + 8 + 4;
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
    pub remaining_quantity: u64, //8;
    pub redeemed: u64, //8;
    pub pending_redemption: u64, //8;
    pub nonce: u16, //2;
    pub price:u64, //8;
    pub store: Pubkey, //32;
    pub payment: Pubkey, //32;
    pub expiration: i64, //8;
    pub expiration_minutes_after_redemption: u32, //4;
}

const TICKET_TAKER_SIZE: usize = 1 + 1 + 32 + 1 + 32 + 32 + 8 + 8 + 8 + 8;
#[account]
pub struct TicketTaker {
    pub bump: u8, //1;
    pub version: u8, //1,
    pub taker: Pubkey, //32,
    pub entity_type: u8, //1, store or product?
    pub entity: Pubkey, //32, reference to store or product
    pub authorized_by: Pubkey, //32, account that authorized this ticket taker
    pub enabled_slot: u64, //8,
    pub enabled_timestamp: i64, //8, unix timestamp
    pub disabled_slot: u64, //8,
    pub disabled_timestamp: i64, //8, unix timestamp
}

const REDEMPTION_SIZE: usize = 1 + 1 + 4 + 8 + 8 + 8 + 8 + 32 + 32 + 32 + 32 + 32 + 32 + 32 + 32 + 8 + 8 + 32 + 32 + 1 + 8 + 8;
#[account]
pub struct Redemption {
    pub bump: u8, //1;    
    pub version: u8, //1; used for versioning schema, etc... to identify how to serialize/deserialize changes that may occur in the future
    pub nonce: u32, //4;
    pub init_slot: u64, //8;
    pub close_slot: u64, //8;
    pub init_timestamp: i64, //8; unixtimestamp
    pub close_timestamp: i64, //8;
    pub store: Pubkey, //32;
    pub product: Pubkey, //32;
    pub product_snapshot_metadata: Pubkey, //32;
    pub product_snapshot: Pubkey, //32;
    pub purchase_ticket: Pubkey, //32;
    pub purchase_ticket_signer: Pubkey, //32;
    pub buyer: Pubkey, //32;
    pub pay_to: Pubkey, //32;
    //pub purchase_ticket_remaining_quantity: u64, //8;
    pub redeem_quantity: u64, //8;
    pub price:u64, //8;
    pub ticket_taker: Pubkey, //32;
    pub ticket_taker_signer: Pubkey, //32;
    pub status: u8, //1;
    pub take_expiration: i64, //8;
    pub usage_expiration: i64, //8;
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
    #[msg("NotMutable")]
    NotMutable,
    #[msg("authority Doesn't Exist")]
    AuthorityDoesntExist,
    #[msg("pay_to Doesn't Exist")]
    PayToDoesntExist,
    #[msg("price is greater than payment")]
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
    #[msg("product is not active")]
    ProductIsNotActive,
    #[msg("store is not active")]
    StoreIsNotActive,
    #[msg("modifying snapshots is not allowed")]
    UnableToModifySnapshot,
    #[msg("purchasing snapshots is not allowed")]
    UnableToPurchaseSnapshot,
    #[msg("invalid token account")]
    InvalidTokenAccount,
    #[msg("signer isn't the ticket taker")]
    InvalidTicketTakerSigner,
    #[msg("ticket taker isn't authorized to take the ticket")]
    InvalidTicketTaker,
    #[msg("not enough redemptions remain")]
    InsufficientRemainingRedemptions,
    #[msg("quantity must be greater than zero")]
    QuantityMustBeGreaterThanZero,
    #[msg("insufficient quantity")]
    InsufficientQuantity,
    #[msg("incorrect seed")]
    IncorrectSeed,
    #[msg("already processed")]
    AlreadyProcessed,
    #[msg("already redeemed")]
    AlreadyRedeemed,
    #[msg("product is expired")]
    ProductIsExpired,
    #[msg("ticket is expired")]
    TicketIsExpired,
    #[msg("agreed expiration doesn't match the currently configured product setting")]
    AgreedExpirationDoesntMatch,
    #[msg("agreed expiration after purchase doesn't match the currently configured product setting")]
    AgreedExpirationAfterPurchaseDoesntMatch,
    #[msg("agreed expiration after redemption doesn't match the currently configured product setting")]
    AgreedExpirationAfterRedemptionDoesntMatch,
    #[msg("the ability to take has expired")]
    TakeIsExpired,
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

struct ProductStatus;
impl ProductStatus {
    const ACTIVE: u8 = 0;
    //const INACTIVE: u8 = 1;
}

struct RedemptionType;
impl RedemptionType {
    const IMMEDIATE: u8 = 1;
    //const TICKET: u8 =  2;
    //const CONFIRMATION: u8 = 4;
}
struct RedemptionStatus;
impl RedemptionStatus {
    const WAITING: u8 = 0;
    const REDEEMED: u8 = 1;
    const CANCELLED: u8 = 2;
}

struct EntityType;
impl EntityType {
    const STORE: u8 = 1;
    const PRODUCT: u8 = 2;
}