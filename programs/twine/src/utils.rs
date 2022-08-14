use {
    crate::{ErrorCode},
    anchor_lang::{
        prelude::*,
        solana_program::{
            program::invoke_signed,
            program_option::COption,
            program_pack::{IsInitialized, Pack},
            system_instruction,
        },
    },
    anchor_spl::token::{Mint, Token, TokenAccount},
    arrayref::array_ref,
    metaplex_token_metadata::state::Metadata,
    spl_associated_token_account::get_associated_token_address,
    spl_token::{instruction::initialize_account2, state::Account},
    std::{convert::TryInto, slice::Iter},
};


pub fn make_ata<'a>(
    ata: AccountInfo<'a>,
    wallet: AccountInfo<'a>,
    mint: AccountInfo<'a>,
    fee_payer: AccountInfo<'a>,
    ata_program: AccountInfo<'a>,
    token_program: AccountInfo<'a>,
    system_program: AccountInfo<'a>,
    rent: AccountInfo<'a>,
    fee_payer_seeds: &[&[u8]],
) -> Result<()> {
    let seeds: &[&[&[u8]]];
    let as_arr = [fee_payer_seeds];

    if fee_payer_seeds.len() > 0 {
        seeds = &as_arr;
    } else {
        seeds = &[];
    }

    invoke_signed(
        &spl_associated_token_account::create_associated_token_account(
            &fee_payer.key,
            &wallet.key,
            &mint.key,
        ),
        &[
            ata,
            wallet,
            mint,
            fee_payer,
            ata_program,
            system_program,
            rent,
            token_program,
        ],
        seeds,
    )?;

    Ok(())
}