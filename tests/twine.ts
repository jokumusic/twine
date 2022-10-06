import * as anchor from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import { Twine } from "../target/types/twine";
import {PublicKey, Keypair, sendAndConfirmTransaction} from "@solana/web3.js";
import { assert, expect } from "chai";
import { bytes, publicKey, rpc } from "@project-serum/anchor/dist/cjs/utils";
import { BN } from "bn.js";
import {TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, createAccount, getOrCreateAssociatedTokenAccount, Account} from "@solana/spl-token";
import * as spl_token from "@solana/spl-token";
import * as data from './data.json';
import { compress, decompress, trimUndefined, trimUndefinedRecursively } from 'compress-json';
import * as tokenFaucetIdl from "./tokenfaucet.json";
import type { Tokenfaucet }  from "./tokenfaucet.ts";
import TransactionFactory from "@project-serum/anchor/dist/cjs/program/namespace/transaction";

const generateRandomU16 = () => {
  return Math.floor(Math.random() * Math.pow(2,16));
}

const generateRandomU32 = () => {
  return Math.floor(Math.random() * Math.pow(2,32));
}

const uIntToBytes = (num, size, method) => {
  const arr = new ArrayBuffer(size)
  const view = new DataView(arr)
  view[method + (size * 8)](0, num)
  return arr
}

const toBytes = (data, type) =>
  type == "u8"  ? uIntToBytes(data, 1, "setUint") :
  type == "u16" ? uIntToBytes(data, 2, "setUint") :
  type == "u32" ? uIntToBytes(data, 4, "setUint") :
  type == "u64" ? uIntToBytes(BigInt(data), 8, "setBigUint")
                : `Not Sure about type - ${type}`


const RUN_STANDARD_TESTS = true;
const LOAD_MOCK_DATA = false;

const PURCHASE_TRANSACTION_FEE = 10000;
///All of the following tests are oriented around a user program on a mobile/web app interacting with the program.
///Most of the time the user program has to send transactions to a separate wallet program...
const creatorKeypair = Keypair.generate();
const storeSecondaryAuthorityKeypair = Keypair.generate();
const ticketTakerKeypair = Keypair.generate();
const buyForKeypair = Keypair.generate();
const secondaryAuthorityPubkey = new PublicKey("BriPLDEoL3odKfPCv8UCWMjXgeBepv7ytRxH1nYmS4qA");
const feeAccountPubkey = new PublicKey("BriPLDEoL3odKfPCv8UCWMjXgeBepv7ytRxH1nYmS4qA");
const payToAccountPubkey = new PublicKey("BriPLDEoL3odKfPCv8UCWMjXgeBepv7ytRxH1nYmS4qA");

// because it's funded by airdrop, must be less than or equal to 1_000_000_000
const creatorAccountLamportsRequired = LOAD_MOCK_DATA 
  ? 20000000 * (data.stores.length + data.products.length) + 100000000
  : 100000000; 


const provider = anchor.AnchorProvider.env();
anchor.setProvider(provider);
console.log('creator pubkey: ', creatorKeypair.publicKey.toBase58());
//console.log('payto: ', paytoKeypair.publicKey.toBase58());


describe("[Twine]", () => {
  const program = anchor.workspace.Twine as Program<Twine>;  
  const tokenFaucetProgram = new anchor.Program(tokenFaucetIdl, new PublicKey(tokenFaucetIdl.metadata.address), provider) as anchor.Program<Tokenfaucet>;
  const storeId = generateRandomU16();
  const storeName = "test-store";
  const storeDescription = "test-store description";  
  const storeProductId = generateRandomU32();
  const productName = "test-product";
  const productDescription = "test-product-description";
  const productPrice = new BN(1000000); //1 USDC
  const productInventory = new BN(5);
  const paymentTokensRequired = productPrice.toNumber() + PURCHASE_TRANSACTION_FEE;

  let [programMetadataPda, programMetadataPdaBump] = PublicKey.findProgramAddressSync(
    [
      anchor.utils.bytes.utf8.encode("program_metadata"), 
    ], program.programId);
  let [storePda, storePdaBump] = PublicKey.findProgramAddressSync(
    [
      anchor.utils.bytes.utf8.encode("store"),
      creatorKeypair.publicKey.toBuffer(),
      Buffer.from(uIntToBytes(storeId,2,"setUint"))
    ], program.programId);
  let [storeProductPda, storeProductPdaBump] = PublicKey.findProgramAddressSync(
    [
      anchor.utils.bytes.utf8.encode("product"),
      creatorKeypair.publicKey.toBuffer(),
      Buffer.from(uIntToBytes(storeProductId,4,"setUint"))
    ], program.programId);
  let [paymentTokenMintAddress, paymentTokenMintAddressBump] = PublicKey.findProgramAddressSync(
    [
      anchor.utils.bytes.utf8.encode("mint"),
    ], tokenFaucetProgram.programId);


  before(() => {
    return new Promise<void>(async (resolve,reject) => {

      console.log(`funding creator account with ${creatorAccountLamportsRequired} lamports...`);
      
      const airdropSignature = await provider.connection
        .requestAirdrop(creatorKeypair.publicKey, creatorAccountLamportsRequired)
        .catch(reject);

      if(!airdropSignature)
        return;   

      const airdropConfirmation = await provider.connection
        .confirmTransaction(airdropSignature,'finalized')
        .catch(reject);

      if(!airdropConfirmation)
        return;

      console.log('transferring funds to test accounts');
      const fundAccountsTx = new anchor.web3.Transaction();
      fundAccountsTx.add(
        anchor.web3.SystemProgram.transfer({
          fromPubkey: creatorKeypair.publicKey,
          toPubkey: storeSecondaryAuthorityKeypair.publicKey,
          lamports: 2000000
        })
      );

      fundAccountsTx.add(
        anchor.web3.SystemProgram.transfer({
          fromPubkey: creatorKeypair.publicKey,
          toPubkey: ticketTakerKeypair.publicKey,
          lamports: 6000000
        })
      );

      fundAccountsTx.add(
        anchor.web3.SystemProgram.transfer({
          fromPubkey: creatorKeypair.publicKey,
          toPubkey: buyForKeypair.publicKey,
          lamports: 14000000
        })
      );
    
      const fundAccountsTxSignature = await provider.connection.sendTransaction(fundAccountsTx, [creatorKeypair]);
      const fundAccountsTxConfirmation = await provider.connection
        .confirmTransaction(fundAccountsTxSignature,'finalized')
        .catch(reject);

      resolve();
    });
  });

/*
  describe("[Program Tests]", () => {    
    it("Initialize Program", async () => {
      let programMetadata = await program.account.programMetadata.fetchNullable(programMetadataPda);
      
      if(programMetadata) {
        console.info('program metadata is already initialized')
        return;
      }

      const tx = await program.methods
      .initialize(new anchor.BN(PURCHASE_TRANSACTION_FEE))
      .accounts({
        programMetadata: programMetadataPda,
        creator: creatorKeypair.publicKey,
        authority: provider.publicKey,
        secondaryAuthority: secondaryAuthorityPubkey,
        feeAccount: feeAccountPubkey,
      })
      .transaction();

      const response = await anchor.web3.sendAndConfirmTransaction(provider.connection, tx, [creatorKeypair], {commitment: 'finalized'});
      
      programMetadata = await program.account.programMetadata.fetch(programMetadataPda);
      expect(programMetadata.bump).is.equal(programMetadataPdaBump);
      expect(programMetadata.initialized).is.equal(true);
      expect(programMetadata.version).is.equal(0);
      expect(programMetadata.creator).is.eql(creatorKeypair.publicKey);
      expect(programMetadata.authority).is.eql(provider.publicKey);
      expect(programMetadata.secondaryAuthority).is.eql(secondaryAuthorityPubkey);
      expect(programMetadata.feeAccount).is.eql(feeAccountPubkey);
      expect(programMetadata.fee.toNumber()).is.equal(PURCHASE_TRANSACTION_FEE);
    });

    it("Change fee account", async () => {
      const feeTokenAccount = await spl_token.getOrCreateAssociatedTokenAccount(
        provider.connection,
        creatorKeypair,
        paymentTokenMintAddress,
        feeAccountPubkey,
        false,
        'finalized',
        {commitment:'finalized'},
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID);

      const tx = await program.methods
      .changeFeeAccount()
      .accounts({
        programMetadata: programMetadataPda,
        authority: provider.publicKey,
        feeAccount: feeAccountPubkey,
      })
      .rpc();
      
      const programMetadata = await program.account.programMetadata.fetch(programMetadataPda);
      expect(programMetadata.feeAccount).is.eql(feeAccountPubkey);
    });

  }); //program tests
*/
if(RUN_STANDARD_TESTS)
{
  /*
  describe("[Store Tests]", () => {
    it("Create Store", async () => {
      const data = JSON.stringify(compress({displayName: storeName, displayDescription: storeDescription}));
      const storeStatus = 1;

      const tx = await program.methods
      .createStore(storeId, storeStatus, storeName.toLowerCase(), storeDescription.toLowerCase(), data)
      .accounts({
        store: storePda,
        creator: creatorKeypair.publicKey,
        authority: creatorKeypair.publicKey,
        secondaryAuthority: storeSecondaryAuthorityKeypair.publicKey,    
      })
      .transaction();

      const response = await anchor.web3.sendAndConfirmTransaction(provider.connection, tx, [creatorKeypair]);  

      const createdStore = await program.account.store.fetch(storePda);
      expect(createdStore.bump).is.equal(storePdaBump);
      expect(createdStore.status).is.equal(storeStatus);
      expect(createdStore.id).is.equal(storeId);
      expect(createdStore.creator).is.eql(creatorKeypair.publicKey);
      expect(createdStore.authority).is.eql(creatorKeypair.publicKey);
      expect(createdStore.secondaryAuthority).is.eql(storeSecondaryAuthorityKeypair.publicKey);
      expect(createdStore.tag.toNumber()).is.equal(0);
      expect(createdStore.name).is.equal(storeName.toLowerCase());
      expect(createdStore.description).is.eql(storeDescription.toLowerCase());
      expect(createdStore.productCount.toNumber()).is.equal(0);  
      expect(createdStore.data).is.equal(data);
      
    });


    it("Update Store", async () => {
      const updatedStoreName = storeName + "-updated";
      const updatedStoreDescription = storeDescription + "-updated";
      const updatedStoreStatus = 1;
      const data = JSON.stringify({displayName: updatedStoreName, displayDescription: updatedStoreDescription});

      //this should succeed because the owner is correct
      const tx = await program.methods
      .updateStore(updatedStoreStatus, updatedStoreName.toLowerCase(), updatedStoreDescription.toLowerCase(), data)
      .accounts({
        store: storePda,
        authority: creatorKeypair.publicKey,
      })
      .transaction();

      const response = await anchor.web3.sendAndConfirmTransaction(provider.connection, tx, [creatorKeypair]);

      const updatedStore= await program.account.store.fetch(storePda);
      expect(updatedStore.bump).is.equal(storePdaBump);
      expect(updatedStore.status).is.equal(updatedStoreStatus);
      expect(updatedStore.creator).is.eql(creatorKeypair.publicKey);
      expect(updatedStore.authority).is.eql(creatorKeypair.publicKey);
      expect(updatedStore.secondaryAuthority).is.eql(storeSecondaryAuthorityKeypair.publicKey);
      expect(updatedStore.id).is.equal(storeId);
      expect(updatedStore.tag.toNumber()).is.equal(0);
      expect(updatedStore.productCount.toNumber()).is.equal(0);  
      expect(updatedStore.name).is.equal(updatedStoreName.toLowerCase());
      expect(updatedStore.description).is.equal(updatedStoreDescription.toLowerCase());
      expect(updatedStore.data).is.eql(data);

    });


    it("Update Store As Secondary Authority", async () => {
      const updatedStoreName = storeName + "-updated-2";
      const updatedStoreDescription = storeDescription + "-updated-2";
      const updatedStoreStatus = 1;
      const data = JSON.stringify({displayName: updatedStoreName, displayDescription: updatedStoreDescription});

      //this should succeed because the owner is correct
      const tx = await program.methods
      .updateStore(updatedStoreStatus, updatedStoreName.toLowerCase(), updatedStoreDescription.toLowerCase(), data)
      .accounts({
        store: storePda,
        authority: storeSecondaryAuthorityKeypair.publicKey,
      })
      .transaction();

      const response = await anchor.web3.sendAndConfirmTransaction(provider.connection, tx, [storeSecondaryAuthorityKeypair]);

      const updatedStore= await program.account.store.fetch(storePda);
      expect(updatedStore.bump).is.equal(storePdaBump);
      expect(updatedStore.status).is.equal(updatedStoreStatus);
      expect(updatedStore.creator).is.eql(creatorKeypair.publicKey);
      expect(updatedStore.authority).is.eql(creatorKeypair.publicKey);
      expect(updatedStore.secondaryAuthority).is.eql(storeSecondaryAuthorityKeypair.publicKey);
      expect(updatedStore.id).is.equal(storeId);
      expect(updatedStore.tag.toNumber()).is.equal(0);
      expect(updatedStore.productCount.toNumber()).is.equal(0);  
      expect(updatedStore.name).is.equal(updatedStoreName.toLowerCase());
      expect(updatedStore.description).is.equal(updatedStoreDescription.toLowerCase());
      expect(updatedStore.data).is.eql(data);

    });


    it("Create Store Product", async () => {    
      //const productMintDecimals = 3;
      const data = JSON.stringify({displayName: productName, displayDescription: productDescription});
      const redemptionType = 1;
      const productStatus = 0;

      const tx = await program.methods
        .createStoreProduct(storeProductId, productStatus, //productMintDecimals, 
        productPrice, productInventory, redemptionType, productName.toLowerCase(), productDescription.toLowerCase(), data)
        .accounts({
          //mint: storeProductMintPda,
          product: storeProductPda,
          store: storePda,
          creator: creatorKeypair.publicKey,
          authority: creatorKeypair.publicKey,
          secondaryAuthority: secondaryAuthorityPubkey,  
          payTo: payToAccountPubkey,
          //tokenProgram: TOKEN_PROGRAM_ID,
        })
        .transaction();
    
      //setting feepayer,recentblockhash and then partialsigning is being done here, because that's the way it has to be done by mobile/web app client
      //because they have to use a separate wallet program for signing
      tx.feePayer = creatorKeypair.publicKey;
      tx.recentBlockhash = (await provider.connection.getLatestBlockhash()).blockhash;
      tx.partialSign(creatorKeypair); //this is where the wallet would be called to sign the transaction

      
      const txid = await anchor.web3.sendAndConfirmRawTransaction(provider.connection, 
        tx.serialize({ requireAllSignatures: true, verifySignatures: true }), 
        {skipPreflight: true, commitment:'confirmed'});

      //console.log('txid: ', txid);
      //const response = await anchor.web3.sendAndConfirmTransaction(provider.connection, tx, [ownerKeypair]);
      //console.log('create_product response: ', response);

      const createdProduct = await program.account.product.fetch(storeProductPda);
      expect(createdProduct.bump).is.equal(storeProductPdaBump);
      expect(createdProduct.status).is.equal(productStatus);
      expect(createdProduct.creator).is.eql(creatorKeypair.publicKey);
      expect(createdProduct.authority).is.eql(creatorKeypair.publicKey);
      expect(createdProduct.secondaryAuthority).is.eql(secondaryAuthorityPubkey);
      expect(createdProduct.id).is.equal(storeProductId); 
      expect(createdProduct.tag.toNumber()).is.equal(0); 
      //expect(createdProduct.mint).is.eql(storeProductMintPda);
      expect(createdProduct.payTo).is.eql(payToAccountPubkey);
      expect(createdProduct.store).is.eql(storePda); 
      expect(createdProduct.price.toNumber()).is.equal(productPrice.toNumber());
      expect(createdProduct.inventory.toNumber()).is.equal(productInventory.toNumber());
      expect(createdProduct.redemptionType).is.equal(redemptionType);
      expect(createdProduct.name).is.equal(productName.toLowerCase());
      expect(createdProduct.description).is.equal(productDescription.toLowerCase());  
      expect(createdProduct.data).is.equal(data);


      const store = await program.account.store.fetch(storePda);
      expect(store.productCount.toNumber()).is.equal(1);

      //const mintAccount = await spl_token.getMint(provider.connection, storeProductMintPda,'confirmed', TOKEN_PROGRAM_ID);
      //expect(mintAccount.address).is.eql(storeProductMintPda)
      //expect(mintAccount.decimals).is.equal(productMintDecimals);
      //expect(mintAccount.supply).is.equal(BigInt(0));
      //expect(mintAccount.freezeAuthority).is.eql(storeProductMintPda);
      //expect(mintAccount.mintAuthority).is.eql(storeProductMintPda);
      //expect(mintAccount.isInitialized).is.equal(true);    
    });

    
    it("Update Store Product", async () => {
      const updatedProductStatus = 1;
      const updatedProductName = productName + "-updated";
      const updatedProductDescription = productDescription + "-updated";
      const updatedProductPrice = 200000;
      const updatedProductInventory = 2;
      const updatedProductData = JSON.stringify({displayName: updatedProductName, displayDescription: updatedProductDescription});
      const updatedRedemptionType = 2;

      //this should succeed because the owner is correct
      const txSuccess = await program.methods
      .updateProduct(updatedProductStatus, new BN(updatedProductPrice), new BN(updatedProductInventory), updatedRedemptionType,
          updatedProductName.toLowerCase(), updatedProductDescription.toLowerCase(), updatedProductData)
      .accounts({
        product: storeProductPda, 
        authority: creatorKeypair.publicKey,  
      })
      .transaction();

      const txSucceeded = await anchor.web3.sendAndConfirmTransaction(provider.connection, txSuccess, [creatorKeypair],{commitment:'processed'});

      const updatedProduct = await program.account.product.fetch(storeProductPda);
      expect(updatedProduct.bump).is.equal(storeProductPdaBump);
      expect(updatedProduct.status).is.equal(updatedProductStatus);
      expect(updatedProduct.creator).is.eql(creatorKeypair.publicKey);
      expect(updatedProduct.authority).is.eql(creatorKeypair.publicKey);
      expect(updatedProduct.secondaryAuthority).is.eql(secondaryAuthorityPubkey);
      expect(updatedProduct.id).is.equal(storeProductId);
      expect(updatedProduct.tag.toNumber()).is.equal(0); 
      //expect(updatedProduct.mint).is.eql(storeProductMintPda);
      expect(updatedProduct.payTo).is.eql(payToAccountPubkey);
      expect(updatedProduct.store).is.eql(storePda); 
      expect(updatedProduct.price.toNumber()).is.equal(updatedProductPrice);
      expect(updatedProduct.inventory.toNumber()).is.equal(updatedProductInventory);
      expect(updatedProduct.name).is.equal(updatedProductName.toLowerCase());
      expect(updatedProduct.description).is.equal(updatedProductDescription.toLowerCase());
      expect(updatedProduct.data).is.equal(updatedProductData);
    });

    it("Create Store Ticket Taker", async () => {
      const [storeTicketTakerPda, storeTicketTakerPdaBump] = PublicKey.findProgramAddressSync(
        [
          anchor.utils.bytes.utf8.encode("store_taker"),
          storePda.toBuffer(),
          ticketTakerKeypair.publicKey.toBuffer(),        
        ], program.programId);
  
      const txSuccess = await program.methods
        .createStoreTicketTaker()
        .accounts({
          ticketTaker: storeTicketTakerPda,
          taker: ticketTakerKeypair.publicKey,
          store: storePda,
          storeAuthority: creatorKeypair.publicKey
        })
        .transaction();
  
      const txSucceeded = await anchor.web3.sendAndConfirmTransaction(provider.connection, txSuccess, [creatorKeypair]);
  
      const ticketTaker = await program.account.ticketTaker.fetch(storeTicketTakerPda);
      expect(ticketTaker.bump).is.equal(storeTicketTakerPdaBump);
      expect(ticketTaker.version).is.equal(0);
      expect(ticketTaker.taker).is.eql(ticketTakerKeypair.publicKey);
      expect(ticketTaker.entityType).is.equal(1);
      expect(ticketTaker.authorizedBy).is.eql(creatorKeypair.publicKey);
      expect(ticketTaker.enabledSlot.toNumber()).is.greaterThan(0);
      expect(ticketTaker.enabledTimestamp.toNumber()).is.greaterThan(0);
      expect(ticketTaker.disabledSlot.toNumber()).is.equal(0);
      expect(ticketTaker.disabledTimestamp.toNumber()).is.equal(0);
    });

  });//store tests
*/
  describe("[Lone Product Tests]", () => {
    const loneProductId = generateRandomU32();
    const updatedProductPrice = 200000;
    let [loneProductPda, loneProductPdaBump] = PublicKey.findProgramAddressSync(
      [
        anchor.utils.bytes.utf8.encode("product"),
        creatorKeypair.publicKey.toBuffer(),
        Buffer.from(uIntToBytes(loneProductId,4,"setUint"))
      ], program.programId);

    it("Create Lone Product - Immediate Redemption", async () => {    
      //const productMintDecimals = 3;
      const data = JSON.stringify({displayName: productName, displayDescription: productDescription});
      const redemptionType = 1; //immediate
      const loneProductStatus = 0;

      const tx = await program.methods
      .createProduct(loneProductId, loneProductStatus, //productMintDecimals,
      productPrice, productInventory, redemptionType, productName.toLowerCase(), productDescription.toLowerCase(), data)
      .accounts({
        //mint: loneProductMintPda,
        product: loneProductPda,
        creator: creatorKeypair.publicKey,
        authority: creatorKeypair.publicKey,
        secondaryAuthority: secondaryAuthorityPubkey,
        payTo: payToAccountPubkey,
      })
      .transaction();
    
      const response = await anchor.web3.sendAndConfirmTransaction(provider.connection, tx, [creatorKeypair]);

      const createdProduct = await program.account.product.fetch(loneProductPda);
      expect(createdProduct.bump).is.equal(loneProductPdaBump);
      expect(createdProduct.status).is.equal(loneProductStatus);
      expect(createdProduct.creator).is.eql(creatorKeypair.publicKey);
      expect(createdProduct.authority).is.eql(creatorKeypair.publicKey);
      expect(createdProduct.secondaryAuthority).is.eql(secondaryAuthorityPubkey);
      expect(createdProduct.id).is.equal(loneProductId); 
      expect(createdProduct.tag.toNumber()).is.equal(0); 
      expect(createdProduct.isSnapshot).is.equal(false); 
      //expect(createdProduct.mint).is.eql(loneProductMintPda);
      expect(createdProduct.payTo).is.eql(payToAccountPubkey);
      expect(createdProduct.store).is.eql(PublicKey.default); 
      expect(createdProduct.price.toNumber()).is.equal(productPrice.toNumber());
      expect(createdProduct.inventory.toNumber()).is.equal(productInventory.toNumber());
      expect(createdProduct.redemptionType).is.equal(redemptionType);
      expect(createdProduct.name).is.equal(productName.toLowerCase());
      expect(createdProduct.description).is.equal(productDescription.toLowerCase())    
      expect(createdProduct.data).is.equal(data);

      
      //const mintAccount = await spl_token.getMint(provider.connection, loneProductMintPda,'confirmed', TOKEN_PROGRAM_ID);
      //expect(mintAccount.address).is.eql(loneProductMintPda)
      //expect(mintAccount.decimals).is.equal(productMintDecimals);
      //expect(mintAccount.supply).is.equal(BigInt(0));
      //expect(mintAccount.freezeAuthority).is.eql(loneProductMintPda);
      //expect(mintAccount.mintAuthority).is.eql(loneProductMintPda);
      //expect(mintAccount.isInitialized).is.equal(true);    
      
    });

    it("Create and fund buyer ATA for payment token - Immediate Redemption", async() => {
      const buyerPaymentTokenAccount = await spl_token.getOrCreateAssociatedTokenAccount(
        provider.connection,
        creatorKeypair,
        paymentTokenMintAddress,
        creatorKeypair.publicKey,
        false,
        'finalized',
        {commitment:'finalized'},
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID);


        //console.log('buyer token account: ', buyerPaymentTokenAccount.address.toBase58());
        expect(buyerPaymentTokenAccount.mint).is.eql(paymentTokenMintAddress);
        expect(buyerPaymentTokenAccount.owner).is.eql(creatorKeypair.publicKey);
        expect(buyerPaymentTokenAccount.amount).is.equal(BigInt(0));

        //console.log(`funding creator payment account with ${paymentTokensRequired} tokens from mint ${paymentTokenMintAddress}`);
        const paymentTokenAirdropTx = await tokenFaucetProgram.methods
          .executeAirdrop(new anchor.BN(paymentTokensRequired))
          .accounts({
            signer: creatorKeypair.publicKey,
            mint: paymentTokenMintAddress,
            recipient: buyerPaymentTokenAccount.address,
          })
          .transaction();

        const response = await anchor.web3.sendAndConfirmTransaction(provider.connection, paymentTokenAirdropTx, [creatorKeypair], {commitment: 'finalized'});
        const updatedBuyerPaymentTokenAccount = await spl_token.getAccount(provider.connection, buyerPaymentTokenAccount.address, 'finalized', TOKEN_PROGRAM_ID);
        expect(updatedBuyerPaymentTokenAccount.address).is.eql(buyerPaymentTokenAccount.address);
        expect(updatedBuyerPaymentTokenAccount.mint).is.eql(paymentTokenMintAddress);
        expect(updatedBuyerPaymentTokenAccount.owner).is.eql(creatorKeypair.publicKey);
        expect(updatedBuyerPaymentTokenAccount.amount).is.equal(BigInt(paymentTokensRequired));
    });


    it("Buy Lone Product - Immediate Redemption", async () => {
      const quantity = 1;
      let buyForPubkey = creatorKeypair.publicKey;
      const loneProduct = await program.account.product.fetch(loneProductPda);
      const buyerPaymentTokenAddress = await spl_token.getAssociatedTokenAddress(paymentTokenMintAddress, creatorKeypair.publicKey, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
      const payToAtaAddress = await spl_token.getAssociatedTokenAddress(paymentTokenMintAddress, loneProduct.payTo, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
      
      const nonce = generateRandomU16();
      const feeTokenAccount = await spl_token.getOrCreateAssociatedTokenAccount(
        provider.connection,
        creatorKeypair,
        paymentTokenMintAddress,
        feeAccountPubkey,
        false,
        'confirmed',
        {commitment:'confirmed'},
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID);

      //console.log('buyer payment token address: ', buyerPaymentTokenAddress.toBase58());
      //console.log('payTo ATA address: ', payToAtaAddress.toBase58());
      

      const [productSnapshotMetadataPda, productSnapshotMetadataPdaBump] = PublicKey.findProgramAddressSync(
        [
          anchor.utils.bytes.utf8.encode("product_snapshot_metadata"),
          loneProductPda.toBuffer(),
          creatorKeypair.publicKey.toBuffer(),
          Buffer.from(uIntToBytes(nonce,2,"setUint")),
        ], program.programId);

      const [productSnapshotPda, productSnapshotPdaBump] = PublicKey.findProgramAddressSync(
        [
          anchor.utils.bytes.utf8.encode("product_snapshot"),
          productSnapshotMetadataPda.toBuffer(),
        ], program.programId);

      const [purchaseTicketPda, purchaseTicketPdaBump] = PublicKey.findProgramAddressSync(
        [
          anchor.utils.bytes.utf8.encode("purchase_ticket"),
          productSnapshotMetadataPda.toBuffer(),
          creatorKeypair.publicKey.toBuffer(),
          Buffer.from(uIntToBytes(nonce,2,"setUint"))
        ], program.programId);
    
      const purchaseTicketPaymentAddress = await spl_token.getAssociatedTokenAddress(
        paymentTokenMintAddress,
        purchaseTicketPda,
        true,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID);
      //console.log('purchaseTicketPaymentAddress: ', purchaseTicketPaymentAddress.toBase58());

      const createPurchaseTicketAtaIx = spl_token.createAssociatedTokenAccountInstruction(
        creatorKeypair.publicKey,
        purchaseTicketPaymentAddress,
        purchaseTicketPda,
        paymentTokenMintAddress,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID);
        
      const transferToPurchaseTicketAtaIx = spl_token.createTransferInstruction(
        buyerPaymentTokenAddress,
        purchaseTicketPaymentAddress,
        creatorKeypair.publicKey,
        paymentTokensRequired,
        [],
        TOKEN_PROGRAM_ID,
      );

      let payToAta: Account;
      try {
        payToAta = await spl_token.getAccount(provider.connection, payToAtaAddress, 'confirmed', TOKEN_PROGRAM_ID);
      } catch(ex) {
      }

      const buyProductIx = await program.methods
        .buyProduct(nonce, new anchor.BN(quantity), loneProduct.price)
        .accounts({
          product: loneProductPda,
          productSnapshotMetadata: productSnapshotMetadataPda,
          productSnapshot: productSnapshotPda,
          buyer: creatorKeypair.publicKey,
          buyFor: secondaryAuthorityPubkey,
          payTo: loneProduct.payTo,
          payToTokenAccount: payToAtaAddress,
          purchaseTicket: purchaseTicketPda,
          purchaseTicketPayment: purchaseTicketPaymentAddress,
          purchaseTicketPaymentMint: paymentTokenMintAddress,
          programMetadata: programMetadataPda,
          feeTokenAccount: feeTokenAccount.address,
          feeAccount: feeAccountPubkey,
        })
        .instruction();

      const tx = new anchor.web3.Transaction()
      .add(createPurchaseTicketAtaIx)
      .add(transferToPurchaseTicketAtaIx);

      if(!payToAta) {
        console.info("payTo ATA doesn't exist. adding instruction to create it");
        const createPayToAtaIx = spl_token.createAssociatedTokenAccountInstruction(
          creatorKeypair.publicKey,
          payToAtaAddress,
          loneProduct.payTo,
          paymentTokenMintAddress,
          TOKEN_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID);
        
        tx.add(createPayToAtaIx);
      } else {
        //console.log('payTo ATA: ', payToAta.address.toBase58());
      }

      tx.add(buyProductIx);

      tx.recentBlockhash = (await provider.connection.getLatestBlockhash()).blockhash;
      tx.feePayer = creatorKeypair.publicKey;  

      const response = await anchor.web3.sendAndConfirmTransaction(provider.connection, tx, [creatorKeypair], {commitment: 'finalized'});
      //console.info('transaction signature: ', response);
      
      const productSnapshot = await program.account.product.fetch(productSnapshotPda);
      expect(productSnapshot.bump).is.equal(loneProduct.bump);
      expect(productSnapshot.status).is.equal(loneProduct.status);
      expect(productSnapshot.creator).is.eql(loneProduct.creator);
      expect(productSnapshot.authority).is.eql(loneProduct.authority);
      expect(productSnapshot.secondaryAuthority).is.eql(loneProduct.secondaryAuthority);
      expect(productSnapshot.id).is.equal(loneProduct.id); 
      expect(productSnapshot.tag.toNumber()).is.equal(loneProduct.tag.toNumber()); 
      expect(productSnapshot.isSnapshot).is.equal(true); 
      //expect(productSnapshot.mint).is.eql(loneProduct.mint);
      //expect(productSnapshot.payTo).is.eql(loneProduct.payTo);
      expect(productSnapshot.store).is.eql(loneProduct.store); 
      expect(productSnapshot.price.toNumber()).is.equal(loneProduct.price.toNumber());
      expect(productSnapshot.inventory.toNumber()).is.equal(loneProduct.inventory.toNumber());
      expect(productSnapshot.redemptionType).is.equal(loneProduct.redemptionType);
      expect(productSnapshot.name).is.equal(loneProduct.name);
      expect(productSnapshot.description).is.equal(loneProduct.description)    
      expect(productSnapshot.data).is.equal(loneProduct.data);

      const loneProductAfterPurchase = await program.account.product.fetch(loneProductPda);
      expect(loneProductAfterPurchase.isSnapshot).is.equal(false); 
      expect(loneProductAfterPurchase.inventory.toNumber()).is.equal(loneProduct.inventory.toNumber() - quantity);

      const productSnapshotMetadata = await program.account.productSnapshotMetadata.fetch(productSnapshotMetadataPda);
      expect(productSnapshotMetadata.bump).is.equal(productSnapshotMetadataPdaBump);
      expect(productSnapshotMetadata.product).not.equal(loneProductPda);
      expect(productSnapshotMetadata.productSnapshot).not.equal(productSnapshotPda);
      expect(productSnapshotMetadata.nonce).is.equal(nonce);

      const purchaseTicket = await program.account.purchaseTicket.fetch(purchaseTicketPda);
      expect(purchaseTicket.bump).is.equal(purchaseTicketPdaBump);
      expect(purchaseTicket.product).is.eql(loneProductPda);
      expect(purchaseTicket.productSnapshotMetadata).is.eql(productSnapshotMetadataPda);
      expect(purchaseTicket.productSnapshot).is.eql(productSnapshotPda);
      expect(purchaseTicket.buyer).is.eql(creatorKeypair.publicKey);
      expect(purchaseTicket.payTo).is.eql(loneProduct.payTo);
      expect(purchaseTicket.authority).is.eql(secondaryAuthorityPubkey);
      expect(purchaseTicket.redeemed.toNumber()).is.equal(quantity);
      expect(purchaseTicket.remainingQuantity.toNumber()).is.equal(0);
      expect(purchaseTicket.nonce).is.equal(nonce);
      expect(purchaseTicket.payment).is.eql(purchaseTicketPaymentAddress);

      const purchaseTicketPayment = await spl_token.getAccount(provider.connection, purchaseTicketPaymentAddress);
      expect(purchaseTicketPayment.address).is.eql(purchaseTicketPaymentAddress);
      expect(purchaseTicketPayment.mint).is.eql(paymentTokenMintAddress);
      expect(purchaseTicketPayment.amount).is.equal(BigInt(0));

      const buyerPaymentTokenAccount = await spl_token.getAccount(provider.connection, buyerPaymentTokenAddress);
      expect(buyerPaymentTokenAccount.address).is.eql(buyerPaymentTokenAddress);
      expect(buyerPaymentTokenAccount.mint).is.eql(paymentTokenMintAddress);
      expect(buyerPaymentTokenAccount.amount).is.equal(BigInt(0));
 
    });

    it("Update Lone Product", async () => {
      const updatedProductName = productName + "-updated";
      const updatedProductDescription = productDescription + "-updated";
      
      const updatedData = JSON.stringify({displayName: updatedProductName, displayDescription: updatedProductDescription});
      const updatedStatus = 0;//active
      const updatedInventory = 3;
      const updatedRedemptionType = 2; //ticketed

      //this should succeed because the owner is correct
      const txSuccess = await program.methods
      .updateProduct(updatedStatus, new BN(updatedProductPrice), new BN(updatedInventory), updatedRedemptionType, 
        updatedProductName.toLowerCase(), updatedProductDescription.toLowerCase(), updatedData)
      .accounts({
        product: loneProductPda,
        authority: creatorKeypair.publicKey,
      })
      .transaction();

      const txSucceeded = await anchor.web3.sendAndConfirmTransaction(provider.connection, txSuccess, [creatorKeypair]);

      const updatedProduct = await program.account.product.fetch(loneProductPda);
      expect(updatedProduct.bump).is.equal(loneProductPdaBump);
      expect(updatedProduct.status).is.equal(updatedStatus);
      expect(updatedProduct.creator).is.eql(creatorKeypair.publicKey);
      expect(updatedProduct.authority).is.eql(creatorKeypair.publicKey);
      expect(updatedProduct.secondaryAuthority).is.eql(secondaryAuthorityPubkey);
      expect(updatedProduct.id).is.equal(loneProductId);
      expect(updatedProduct.tag.toNumber()).is.equal(0); 
      //expect(updatedProduct.mint).is.eql(loneProductMintPda);
      expect(updatedProduct.usableSnapshot).is.eql(PublicKey.default);
      expect(updatedProduct.payTo).is.eql(payToAccountPubkey);
      expect(updatedProduct.store).is.eql(PublicKey.default); 
      expect(updatedProduct.price.toNumber()).is.equal(updatedProductPrice);
      expect(updatedProduct.inventory.toNumber()).is.equal(updatedInventory);
      expect(updatedProduct.redemptionType).is.equal(updatedRedemptionType);
      expect(updatedProduct.name).is.equal(updatedProductName.toLowerCase());
      expect(updatedProduct.description).is.equal(updatedProductDescription.toLowerCase());
      expect(updatedProduct.data).is.equal(updatedData);
    });

    
    describe("[Lone Product - Ticket Tests]", () => {      
      const purchaseNonce = generateRandomU16();
      const purchaseQuantity = 3;
      const purchaseAmountRequired = (updatedProductPrice + PURCHASE_TRANSACTION_FEE) * purchaseQuantity;
      const [loneProductTicketTakerPda, loneProductTicketTakerPdaBump] = PublicKey.findProgramAddressSync(
        [
          anchor.utils.bytes.utf8.encode("product_taker"),
          loneProductPda.toBuffer(),
          ticketTakerKeypair.publicKey.toBuffer(),        
        ], program.programId);
      const [productSnapshotMetadataPda, productSnapshotMetadataPdaBump] = PublicKey.findProgramAddressSync(
        [
          anchor.utils.bytes.utf8.encode("product_snapshot_metadata"),
          loneProductPda.toBuffer(),
          creatorKeypair.publicKey.toBuffer(),
          Buffer.from(uIntToBytes(purchaseNonce,2,"setUint")),
        ], program.programId);
      const [purchaseTicketPda, purchaseTicketPdaBump] = PublicKey.findProgramAddressSync(
        [
          anchor.utils.bytes.utf8.encode("purchase_ticket"),
          productSnapshotMetadataPda.toBuffer(),
          creatorKeypair.publicKey.toBuffer(),
          Buffer.from(uIntToBytes(purchaseNonce,2,"setUint"))
        ], program.programId);
  
      it("Create and fund ticketed product buyer", async()=>{
        const buyerPaymentTokenAccount = await spl_token.getOrCreateAssociatedTokenAccount(
          provider.connection,
          creatorKeypair,
          paymentTokenMintAddress,
          creatorKeypair.publicKey,
          false,
          'finalized',
          {commitment:'finalized'},
          TOKEN_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID);  
  
          expect(buyerPaymentTokenAccount.mint).is.eql(paymentTokenMintAddress);
          expect(buyerPaymentTokenAccount.owner).is.eql(creatorKeypair.publicKey);
          expect(buyerPaymentTokenAccount.amount).is.equal(BigInt(0));
  
          //console.log(`funding creator payment account with ${amountRequiredToPurchaseLoneProduct} tokens from mint ${paymentTokenMintAddress}`);
          const paymentTokenAirdropTx = await tokenFaucetProgram.methods
            .executeAirdrop(new anchor.BN(purchaseAmountRequired))
            .accounts({
              signer: creatorKeypair.publicKey,
              mint: paymentTokenMintAddress,
              recipient: buyerPaymentTokenAccount.address,
            })
            .transaction();
  
          const response = await anchor.web3.sendAndConfirmTransaction(provider.connection, paymentTokenAirdropTx, [creatorKeypair], {commitment: 'finalized'});
          const updatedBuyerPaymentTokenAccount = await spl_token.getAccount(provider.connection, buyerPaymentTokenAccount.address, 'confirmed', TOKEN_PROGRAM_ID);
          expect(updatedBuyerPaymentTokenAccount.mint).is.eql(paymentTokenMintAddress);
          expect(updatedBuyerPaymentTokenAccount.owner).is.eql(creatorKeypair.publicKey);
          expect(updatedBuyerPaymentTokenAccount.amount).is.equal(BigInt(purchaseAmountRequired));  
      });
  
  
      it("Buy Lone Product - Ticketed Redemption", async () => {
        const loneProduct = await program.account.product.fetch(loneProductPda);
        const buyerPaymentTokenAddress = await spl_token.getAssociatedTokenAddress(paymentTokenMintAddress, creatorKeypair.publicKey, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
        const payToAtaAddress = await spl_token.getAssociatedTokenAddress(paymentTokenMintAddress, loneProduct.payTo, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
        
        const feeTokenAccount = await spl_token.getOrCreateAssociatedTokenAccount(
          provider.connection,
          creatorKeypair,
          paymentTokenMintAddress,
          feeAccountPubkey,
          false,
          'confirmed',
          {commitment:'confirmed'},
          TOKEN_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID);
  
        //console.log('buyer payment token address: ', buyerPaymentTokenAddress.toBase58());
        //console.log('payTo ATA address: ', payToAtaAddress.toBase58());        
        const [productSnapshotPda, productSnapshotPdaBump] = PublicKey.findProgramAddressSync(
          [
            anchor.utils.bytes.utf8.encode("product_snapshot"),
            productSnapshotMetadataPda.toBuffer(),
          ], program.programId);
  
        const purchaseTicketPaymentAddress = await spl_token.getAssociatedTokenAddress(
          paymentTokenMintAddress,
          purchaseTicketPda,
          true,
          TOKEN_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID);
  
        //console.log('purchaseTicketPaymentAddress: ', purchaseTicketPaymentAddress.toBase58());  
        const createPurchaseTicketAtaIx = spl_token.createAssociatedTokenAccountInstruction(
          creatorKeypair.publicKey,
          purchaseTicketPaymentAddress,
          purchaseTicketPda,
          paymentTokenMintAddress,
          TOKEN_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID);  
          
        const transferToPurchaseTicketAtaIx = spl_token.createTransferInstruction(
          buyerPaymentTokenAddress,
          purchaseTicketPaymentAddress,
          creatorKeypair.publicKey,
          purchaseAmountRequired,
          [],
          TOKEN_PROGRAM_ID,
        );
  
        let payToAta: Account;
        try {
          payToAta = await spl_token.getAccount(provider.connection, payToAtaAddress, 'confirmed', TOKEN_PROGRAM_ID);
        } catch(ex) {
        }
  
        const buyProductIx = await program.methods
          .buyProduct(purchaseNonce, new anchor.BN(purchaseQuantity), loneProduct.price)
          .accounts({
            product: loneProductPda,
            productSnapshotMetadata: productSnapshotMetadataPda,
            productSnapshot: productSnapshotPda,
            buyer: creatorKeypair.publicKey,
            buyFor: buyForKeypair.publicKey,
            payTo: loneProduct.payTo,
            payToTokenAccount: payToAtaAddress,
            purchaseTicket: purchaseTicketPda,
            purchaseTicketPayment: purchaseTicketPaymentAddress,
            purchaseTicketPaymentMint: paymentTokenMintAddress,
            programMetadata: programMetadataPda,
            feeTokenAccount: feeTokenAccount.address,
            feeAccount: feeAccountPubkey,
          })
          .instruction();
  
        const tx = new anchor.web3.Transaction()
        .add(createPurchaseTicketAtaIx)
        .add(transferToPurchaseTicketAtaIx);
  
        if(!payToAta) {
          console.info("payTo ATA doesn't exist. adding instruction to create it");
          const createPayToAtaIx = spl_token.createAssociatedTokenAccountInstruction(
            creatorKeypair.publicKey,
            payToAtaAddress,
            loneProduct.payTo,
            paymentTokenMintAddress,
            TOKEN_PROGRAM_ID,
            ASSOCIATED_TOKEN_PROGRAM_ID);
          
          tx.add(createPayToAtaIx);
        } else {
          //console.log('payTo ATA: ', payToAta.address.toBase58());
        }
  
        tx.add(buyProductIx);
  
        tx.recentBlockhash = (await provider.connection.getLatestBlockhash()).blockhash;
        tx.feePayer = creatorKeypair.publicKey;  
  
        const response = await anchor.web3.sendAndConfirmTransaction(provider.connection, tx, [creatorKeypair], {commitment: 'finalized'});  
        //console.info('transaction signature: ', response);

        const productSnapshot = await program.account.product.fetch(productSnapshotPda);
        expect(productSnapshot.bump).is.equal(loneProduct.bump);
        expect(productSnapshot.status).is.equal(loneProduct.status);
        expect(productSnapshot.creator).is.eql(loneProduct.creator);
        expect(productSnapshot.authority).is.eql(loneProduct.authority);
        expect(productSnapshot.secondaryAuthority).is.eql(loneProduct.secondaryAuthority);
        expect(productSnapshot.id).is.equal(loneProduct.id); 
        expect(productSnapshot.tag.toNumber()).is.equal(loneProduct.tag.toNumber()); 
        expect(productSnapshot.isSnapshot).is.equal(true); 
        //expect(productSnapshot.mint).is.eql(loneProduct.mint);
        //expect(productSnapshot.payTo).is.eql(loneProduct.payTo);
        expect(productSnapshot.store).is.eql(loneProduct.store); 
        expect(productSnapshot.price.toNumber()).is.equal(loneProduct.price.toNumber());
        expect(productSnapshot.inventory.toNumber()).is.equal(loneProduct.inventory.toNumber());
        expect(productSnapshot.redemptionType).is.equal(loneProduct.redemptionType);
        expect(productSnapshot.name).is.equal(loneProduct.name);
        expect(productSnapshot.description).is.equal(loneProduct.description)    
        expect(productSnapshot.data).is.equal(loneProduct.data);
  
        const loneProductAfterPurchase = await program.account.product.fetch(loneProductPda);
        expect(loneProductAfterPurchase.isSnapshot).is.equal(false); 
        expect(loneProductAfterPurchase.inventory.toNumber()).is.equal(loneProduct.inventory.toNumber() - purchaseQuantity);  
  
        const productSnapshotMetadata = await program.account.productSnapshotMetadata.fetch(productSnapshotMetadataPda);
        expect(productSnapshotMetadata.bump).is.equal(productSnapshotMetadataPdaBump);
        expect(productSnapshotMetadata.product).not.equal(loneProductPda);
        expect(productSnapshotMetadata.productSnapshot).not.equal(productSnapshotPda);
        expect(productSnapshotMetadata.nonce).is.equal(purchaseNonce);  
  
        const purchaseTicket = await program.account.purchaseTicket.fetch(purchaseTicketPda);
        expect(purchaseTicket.bump).is.equal(purchaseTicketPdaBump);
        expect(purchaseTicket.product).is.eql(loneProductPda);
        expect(purchaseTicket.productSnapshotMetadata).is.eql(productSnapshotMetadataPda);
        expect(purchaseTicket.productSnapshot).is.eql(productSnapshotPda);
        expect(purchaseTicket.buyer).is.eql(creatorKeypair.publicKey);
        expect(purchaseTicket.payTo).is.eql(loneProduct.payTo);
        expect(purchaseTicket.authority).is.eql(buyForKeypair.publicKey);
        expect(purchaseTicket.redeemed.toNumber()).is.equal(0);
        expect(purchaseTicket.pendingRedemption.toNumber()).is.equal(0);
        expect(purchaseTicket.remainingQuantity.toNumber()).is.equal(purchaseQuantity);
        expect(purchaseTicket.nonce).is.equal(purchaseNonce);
  
        const purchaseTicketPayment = await spl_token.getAccount(provider.connection, purchaseTicketPaymentAddress);
        expect(purchaseTicketPayment.address).is.eql(purchaseTicketPaymentAddress);
        expect(purchaseTicketPayment.mint).is.eql(paymentTokenMintAddress);
        expect(purchaseTicketPayment.amount).is.equal(BigInt(purchaseAmountRequired - PURCHASE_TRANSACTION_FEE));
  
        const buyerPaymentTokenAccount = await spl_token.getAccount(provider.connection, buyerPaymentTokenAddress);
        expect(buyerPaymentTokenAccount.address).is.eql(buyerPaymentTokenAddress);
        expect(buyerPaymentTokenAccount.mint).is.eql(paymentTokenMintAddress);
        expect(buyerPaymentTokenAccount.amount).is.equal(BigInt(0));
        
      });

      it("Transfer Ticket", async () => {
        const quantity = 1;
        const purchaseNonce = generateRandomU16();
        const purchaseTicketBefore = await program.account.purchaseTicket.fetch(purchaseTicketPda);
        
        const [destinationTicketPda, destinationTicketPdaBump] = PublicKey.findProgramAddressSync(
          [
            anchor.utils.bytes.utf8.encode("purchase_ticket"),
            purchaseTicketBefore.productSnapshotMetadata.toBuffer(),
            purchaseTicketBefore.authority.toBuffer(),
            Buffer.from(uIntToBytes(purchaseNonce,2,"setUint"))
          ], program.programId);

        const sourceTicketPaymentAddress = await spl_token.getAssociatedTokenAddress(
          paymentTokenMintAddress,
          purchaseTicketPda,
          true,
          TOKEN_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID);

        const destinationTicketPaymentAddress = await spl_token.getAssociatedTokenAddress(
          paymentTokenMintAddress,
          destinationTicketPda,
          true,
          TOKEN_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID);       
        
        const sourceTicketPaymentBefore = await spl_token.getAccount(provider.connection, sourceTicketPaymentAddress);

        const tx = await program.methods
          .transferTicket(purchaseNonce, new anchor.BN(quantity))
          .accounts({
            destinationTicket:destinationTicketPda,
            destinationTicketPayment: destinationTicketPaymentAddress,
            destinationTicketAuthority: secondaryAuthorityPubkey,
            sourceTicket: purchaseTicketPda,
            sourceTicketPayment: sourceTicketPaymentAddress,
            sourceTicketAuthority: buyForKeypair.publicKey,
            paymentMint: paymentTokenMintAddress,
          })
          .transaction();

        //tx.recentBlockhash = (await provider.connection.getLatestBlockhash()).blockhash;
        tx.feePayer = buyForKeypair.publicKey;  
        const response = await anchor.web3.sendAndConfirmTransaction(provider.connection, tx, [buyForKeypair], {commitment: 'finalized'});  
        //console.info('transaction signature: ', response);
        
        const purchaseTicketAfter = await program.account.purchaseTicket.fetch(purchaseTicketPda);
        expect(purchaseTicketAfter.redeemed.toNumber()).is.equal(purchaseTicketBefore.redeemed.toNumber());
        expect(purchaseTicketAfter.pendingRedemption.toNumber()).is.equal(purchaseTicketBefore.pendingRedemption.toNumber());
        expect(purchaseTicketAfter.remainingQuantity.toNumber()).is.equal(purchaseTicketBefore.remainingQuantity.toNumber() - quantity);

        const destinationTicket = await program.account.purchaseTicket.fetch(destinationTicketPda);
        expect(destinationTicket.bump).is.equal(destinationTicketPdaBump);
        expect(destinationTicket.product).is.eql(purchaseTicketBefore.product);
        expect(destinationTicket.productSnapshotMetadata).is.eql(purchaseTicketBefore.productSnapshotMetadata);
        expect(destinationTicket.productSnapshot).is.eql(purchaseTicketBefore.productSnapshot);
        expect(destinationTicket.buyer).is.eql(purchaseTicketBefore.authority);
        expect(destinationTicket.payTo).is.eql(purchaseTicketBefore.payTo);
        expect(destinationTicket.authority).is.eql(secondaryAuthorityPubkey);
        expect(destinationTicket.redeemed.toNumber()).is.equal(0);
        expect(destinationTicket.pendingRedemption.toNumber()).is.equal(0);
        expect(destinationTicket.remainingQuantity.toNumber()).is.equal(quantity);
        expect(destinationTicket.nonce).is.equal(purchaseNonce);
        expect(destinationTicket.payment).is.eql(destinationTicketPaymentAddress);
        expect(destinationTicket.slot.toNumber()).is.greaterThan(purchaseTicketBefore.slot.toNumber());
        expect(destinationTicket.timestamp.toNumber()).is.greaterThan(purchaseTicketBefore.timestamp.toNumber());
  
        const destinationTicketPayment = await spl_token.getAccount(provider.connection, destinationTicketPaymentAddress);
        expect(destinationTicketPayment.address).is.eql(destinationTicketPaymentAddress);
        expect(destinationTicketPayment.mint).is.eql(paymentTokenMintAddress);
        expect(destinationTicketPayment.amount).is.equal(BigInt(purchaseTicketBefore.price.toNumber() * quantity));

        const sourceTicketPaymentAfter = await spl_token.getAccount(provider.connection, sourceTicketPaymentAddress);
        expect(sourceTicketPaymentAfter.address).is.eql(sourceTicketPaymentAddress);
        expect(sourceTicketPaymentAfter.mint).is.eql(paymentTokenMintAddress);
        expect(sourceTicketPaymentAfter.amount).is.equal(sourceTicketPaymentBefore.amount - BigInt(purchaseTicketBefore.price.toNumber() * quantity));
      });

      describe("[Redeem Lone Product Ticket]", () => 
      {
        let purchaseTicket;
        let redemptionNonce, redemptionPda, redemptionPdaBump;

        before(async () => {
          return new Promise<void>(async (resolve,reject)=>{
            purchaseTicket = await program.account
              .purchaseTicket
              .fetch(purchaseTicketPda)
              .catch(reject);
            
            if(!purchaseTicket)
              return;
            do {
              redemptionNonce = generateRandomU32(); //await provider.connection.getSlot();
              [redemptionPda, redemptionPdaBump] = PublicKey.findProgramAddressSync(
                [
                  anchor.utils.bytes.utf8.encode("redemption"),
                  purchaseTicketPda.toBuffer(),
                  Buffer.from(uIntToBytes(redemptionNonce,4,"setUint")),
                ], program.programId);
            }while((await program.account.redemption.fetchNullable(redemptionPda)) != null);
            
            resolve();
          });
        });

        it("Create Lone Product Ticket Taker", async () => {          
          const txSuccess = await program.methods
            .createProductTicketTaker()
            .accounts({
              ticketTaker: loneProductTicketTakerPda,
              taker: ticketTakerKeypair.publicKey,
              product: loneProductPda,
              productAuthority: creatorKeypair.publicKey
            })
            .transaction();
    
          const txSucceeded = await anchor.web3.sendAndConfirmTransaction(provider.connection, txSuccess, [creatorKeypair]);
    
          const loneProductTicketTaker = await program.account.ticketTaker.fetch(loneProductTicketTakerPda);
          expect(loneProductTicketTaker.bump).is.equal(loneProductTicketTakerPdaBump);
          expect(loneProductTicketTaker.version).is.equal(0);
          expect(loneProductTicketTaker.taker).is.eql(ticketTakerKeypair.publicKey);
          expect(loneProductTicketTaker.entityType).is.equal(2);
          expect(loneProductTicketTaker.authorizedBy).is.eql(creatorKeypair.publicKey);
          expect(loneProductTicketTaker.enabledSlot.toNumber()).is.greaterThan(0);
          expect(loneProductTicketTaker.enabledTimestamp.toNumber()).is.greaterThan(0);
          expect(loneProductTicketTaker.disabledSlot.toNumber()).is.equal(0);
          expect(loneProductTicketTaker.disabledTimestamp.toNumber()).is.equal(0);
        });

        it("Initiate Redemption", async()=>{
          const quantity = 1;  

          const tx = await program.methods
            .initiateRedemption(redemptionNonce, new anchor.BN(quantity))
            .accounts({
              redemption: redemptionPda,
              purchaseTicket: purchaseTicketPda,
              purchaseTicketAuthority: purchaseTicket.authority, //buyFor address
              purchaseTicketPayment: purchaseTicket.payment,
              purchaseTicketPaymentMint: paymentTokenMintAddress,
            })
            .transaction();
        
          tx.feePayer = buyForKeypair.publicKey;          
          //tx.recentBlockhash = (await provider.connection.getLatestBlockhash()).blockhash;  

          const txSignature = await anchor.web3.sendAndConfirmTransaction(provider.connection, tx, [buyForKeypair], {commitment: 'finalized'});
          //console.info('redemption init signature: ', txSignature);
    
          const redemptionAccount = await program.account.redemption.fetch(redemptionPda);
          expect(redemptionAccount.bump).is.equal(redemptionPdaBump);
          expect(redemptionAccount.version).is.equal(0);
          expect(redemptionAccount.initSlot.toNumber()).is.greaterThan(0);
          expect(redemptionAccount.initTimestamp.toNumber()).is.greaterThan(0);
          expect(redemptionAccount.store).is.eql(purchaseTicket.store);
          expect(redemptionAccount.product).is.eql(purchaseTicket.product);
          expect(redemptionAccount.productSnapshotMetadata).is.eql(purchaseTicket.productSnapshotMetadata);
          expect(redemptionAccount.productSnapshot).is.eql(purchaseTicket.productSnapshot);
          expect(redemptionAccount.purchaseTicket).is.eql(purchaseTicketPda);
          expect(redemptionAccount.purchaseTicketSigner).is.eql(purchaseTicket.authority);
          expect(redemptionAccount.buyer).is.eql(purchaseTicket.buyer);
          expect(redemptionAccount.payTo).is.eql(purchaseTicket.payTo);
          //expect(redemptionAccount.quantity.toNumber()).is.equal(purchaseTicket.remainingQuantity.toNumber());
          expect(redemptionAccount.redeemQuantity.toNumber()).is.equal(quantity);
          expect(redemptionAccount.price.toNumber()).is.equal(purchaseTicket.price.toNumber());
          expect(redemptionAccount.ticketTaker).is.eql(PublicKey.default);
          expect(redemptionAccount.ticketTakerSigner).is.eql(PublicKey.default);
          expect(redemptionAccount.status).is.equal(0);
          expect(redemptionAccount.nonce).is.equal(redemptionNonce);

          const updatedPurchaseTicket = await program.account.purchaseTicket.fetch(purchaseTicketPda);
          expect(updatedPurchaseTicket.redeemed.toNumber()).is.equal(0);
          expect(updatedPurchaseTicket.pendingRedemption.toNumber()).is.equal(quantity);
          expect(updatedPurchaseTicket.remainingQuantity.toNumber()).is.equal(purchaseTicket.remainingQuantity - quantity);
        });

        it("Take Redemption", async ()=>{
          const redemptionBefore = await program.account.redemption.fetch(redemptionPda);
          const purchaseTicketPaymentBefore = await spl_token.getAccount(provider.connection, purchaseTicket.payment);
          const payToTokenAccountAddress = await spl_token.getAssociatedTokenAddress(paymentTokenMintAddress, purchaseTicket.payTo, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
          const payToTokenAccount = await spl_token.getAccount(provider.connection, payToTokenAccountAddress);
          const [productTicketTakerPda, productTicketTakerPdaBump] = PublicKey.findProgramAddressSync(
            [
              anchor.utils.bytes.utf8.encode("product_taker"),
              purchaseTicket.product.toBuffer(),
              ticketTakerKeypair.publicKey.toBuffer(),
            ], program.programId);
          const [storeTicketTakerPda, storeTicketTakerPdaBump] = PublicKey.findProgramAddressSync(
            [
              anchor.utils.bytes.utf8.encode("store_taker"),
              purchaseTicket.store.toBuffer(),
              ticketTakerKeypair.publicKey.toBuffer(),
            ], program.programId);

          let ticketTakerAddress = productTicketTakerPda;
          let ticketTakerAccount = await program.account.ticketTaker.fetchNullable(productTicketTakerPda);
          
          if(!ticketTakerAccount) {
            ticketTakerAddress = storeTicketTakerPda;
            ticketTakerAccount = await program.account.ticketTaker.fetchNullable(storeTicketTakerPda);
          }
  
          expect(ticketTakerAccount).to.not.be.null;

          const tx = await program.methods
          .takeRedemption()
          .accounts({
            purchaseTicket: purchaseTicketPda,
            redemption: redemptionPda,
            ticketTaker: ticketTakerAddress,
            ticketTakerSigner: ticketTakerKeypair.publicKey,
            purchaseTicketPayment: purchaseTicket.payment,
            purchaseTicketPaymentMint: paymentTokenMintAddress,
            payToTokenAccount: payToTokenAccountAddress,
            payTo: purchaseTicket.payTo,
          })
          .transaction();
      
          tx.feePayer = ticketTakerKeypair.publicKey;          
          //tx.recentBlockhash = (await provider.connection.getLatestBlockhash()).blockhash;  

          const txSignature = await anchor.web3.sendAndConfirmTransaction(provider.connection, tx, [ticketTakerKeypair], {commitment: 'finalized'});
          //console.info('ticket redemption signature: ', txSignature);

          const redemptionAfter = await program.account.redemption.fetch(redemptionPda);
          expect(redemptionAfter.ticketTaker).is.eql(ticketTakerAddress);
          expect(redemptionAfter.ticketTakerSigner).is.eql(ticketTakerKeypair.publicKey);
          expect(redemptionAfter.closeSlot.toNumber()).is.greaterThan(redemptionBefore.closeSlot.toNumber());
          expect(redemptionAfter.closeTimestamp.toNumber()).is.greaterThan(redemptionBefore.closeTimestamp.toNumber());
          expect(redemptionAfter.status).is.equal(1);

          const purchaseTicketPayment = await spl_token.getAccount(provider.connection, purchaseTicket.payment);
          expect(purchaseTicketPayment.address).is.eql(purchaseTicket.payment);
          expect(purchaseTicketPayment.mint).is.eql(paymentTokenMintAddress);
          expect(purchaseTicketPayment.amount).is.equal(purchaseTicketPaymentBefore.amount - BigInt(redemptionAfter.price.toNumber() * redemptionAfter.redeemQuantity.toNumber()));
  
          const updatedPayToTokenAccount = await spl_token.getAccount(provider.connection, payToTokenAccountAddress);
          expect(updatedPayToTokenAccount.address).is.eql(payToTokenAccountAddress);
          expect(updatedPayToTokenAccount.owner).is.eql(purchaseTicket.payTo);
          expect(updatedPayToTokenAccount.mint).is.eql(paymentTokenMintAddress);
          expect(updatedPayToTokenAccount.amount).is.equal(payToTokenAccount.amount + BigInt(purchaseTicket.price.toNumber() * redemptionBefore.redeemQuantity.toNumber()));

          const updatedPurchaseTicket = await program.account.purchaseTicket.fetch(purchaseTicketPda);
          expect(updatedPurchaseTicket.redeemed.toNumber()).is.equal(redemptionBefore.redeemQuantity.toNumber());
          expect(updatedPurchaseTicket.pendingRedemption.toNumber()).is.equal(0);
        });

        it("Cancel Redemption", async()=>{
          const cancelRedemptionQuantity = 1;       
          const purchaseTicketBefore = await program.account.purchaseTicket.fetch(purchaseTicketPda);
          const purchaseTicketPayment = await spl_token.getAccount(provider.connection, purchaseTicket.payment);
          let cancelRedemptionNonce, cancelRedemptionPda, cancelRedemptionPdaBump;

          do {
            cancelRedemptionNonce = generateRandomU32(); //await provider.connection.getSlot();
            [cancelRedemptionPda, cancelRedemptionPdaBump] = PublicKey.findProgramAddressSync(
              [
                anchor.utils.bytes.utf8.encode("redemption"),
                purchaseTicketPda.toBuffer(),
                Buffer.from(uIntToBytes(cancelRedemptionNonce,4,"setUint")),
              ], program.programId);
          } while((await program.account.redemption.fetchNullable(cancelRedemptionPda)) != null);

          //console.log(`price=${purchaseTicketBefore.price.toNumber()}, remaining=${purchaseTicketBefore.remainingQuantity.toNumber()}`);
          //console.log(`payment balance:${purchaseTicketPayment.amount}`);

          const initiateRedemptionTx = await program.methods
            .initiateRedemption(cancelRedemptionNonce,new anchor.BN(cancelRedemptionQuantity))
            .accounts({
              redemption: cancelRedemptionPda,
              purchaseTicket: purchaseTicketPda,
              purchaseTicketAuthority: purchaseTicketBefore.authority, //buyFor address
              purchaseTicketPayment: purchaseTicketBefore.payment,
              purchaseTicketPaymentMint: paymentTokenMintAddress,
            })
            .transaction();
        
          initiateRedemptionTx.feePayer = buyForKeypair.publicKey;

          const initiateRedemptionTxSignature = await anchor.web3.sendAndConfirmTransaction(provider.connection, initiateRedemptionTx, [buyForKeypair], {commitment: 'finalized'});
          //console.log('initiateRedemptionTxSignature: ', initiateRedemptionTxSignature);
          const cancelRedemptionPdaAccount = await program.account.redemption.fetchNullable(cancelRedemptionPda);
          expect(cancelRedemptionPdaAccount).to.not.be.null;
          expect(cancelRedemptionPdaAccount.redeemQuantity.toNumber()).is.equal(1);

          const purchaseTicketBeforeCancel = await program.account.purchaseTicket.fetch(purchaseTicketPda);
          expect(purchaseTicketBeforeCancel.remainingQuantity.toNumber()).is.equal(purchaseTicketBefore.remainingQuantity.toNumber() - cancelRedemptionQuantity);
          expect(purchaseTicketBeforeCancel.pendingRedemption.toNumber()).is.equal(purchaseTicketBefore.pendingRedemption.toNumber() + cancelRedemptionQuantity)

          const cancelRedemptionTx = await program.methods
            .cancelRedemption()
            .accounts({
              redemption: cancelRedemptionPda,
              purchaseTicket: purchaseTicketPda,
              purchaseTicketAuthority: buyForKeypair.publicKey, //buyFor address
            })
            .transaction();
        
          initiateRedemptionTx.feePayer = buyForKeypair.publicKey;
          const cancelRedemptionTxSignature = await anchor.web3.sendAndConfirmTransaction(provider.connection, cancelRedemptionTx, [buyForKeypair], {commitment: 'finalized'});
          //console.log('cancelRedemptionTxSignature: ', cancelRedemptionTxSignature);
          const cancelledRedemptionPdaAccount = await program.account.redemption.fetchNullable(cancelRedemptionPda);
          expect(cancelledRedemptionPdaAccount).to.be.null;
          
          const purchaseTicketAfterCancel = await program.account.purchaseTicket.fetch(purchaseTicketPda);
          expect(purchaseTicketAfterCancel.remainingQuantity.toNumber()).is.equal(purchaseTicketBefore.remainingQuantity.toNumber());
          expect(purchaseTicketAfterCancel.pendingRedemption.toNumber()).is.equal(purchaseTicketBefore.pendingRedemption.toNumber());
        });

        it("Cancel Ticket", async() => {
          const cancelQuantity = 1;
          const buyerPaymentTokenAddress = await spl_token.getAssociatedTokenAddress(paymentTokenMintAddress, creatorKeypair.publicKey, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
          const buyerPaymentTokenBefore = await spl_token.getAccount(provider.connection, buyerPaymentTokenAddress);
          const purchaseTicketBefore = await program.account.purchaseTicket.fetch(purchaseTicketPda);
          const purchaseTicketPaymentBefore = await spl_token.getAccount(provider.connection, purchaseTicket.payment);

          const tx = await program.methods
            .cancelTicket(new anchor.BN(cancelQuantity))
            .accounts({
              product: purchaseTicket.product,
              ticket: purchaseTicketPda,
              ticketPayment: purchaseTicket.payment,
              paymentReturn: buyerPaymentTokenAddress,
              paymentMint: paymentTokenMintAddress,
              ticketAuthority: buyForKeypair.publicKey,
            })
            .transaction();
        
          tx.feePayer = buyForKeypair.publicKey;
          const txSignature = await anchor.web3.sendAndConfirmTransaction(provider.connection, tx, [buyForKeypair], {commitment: 'finalized'});
          
          const purchaseTicketAfter = await program.account.purchaseTicket.fetch(purchaseTicketPda);
          expect(purchaseTicketAfter.remainingQuantity.toNumber()).is.equal(purchaseTicketBefore.remainingQuantity.toNumber() - cancelQuantity);
          
          const purchaseTicketPaymentAfter = await spl_token.getAccount(provider.connection, purchaseTicket.payment);
          expect(purchaseTicketPaymentAfter.amount).is.equal(purchaseTicketPaymentBefore.amount - BigInt(purchaseTicket.price.toNumber() * cancelQuantity));

          const buyerPaymentTokenAfter = await spl_token.getAccount(provider.connection, buyerPaymentTokenAddress);
          expect(buyerPaymentTokenAfter.amount).is.equal(buyerPaymentTokenBefore.amount + BigInt(purchaseTicket.price.toNumber() * cancelQuantity));        
        });

      }); //[Redeem Lone Product Ticket]
  
    }); //lone product - ticketed redemption tests

  }); //lone product tests

}//RUN_STANDARD_TESTS


if(LOAD_MOCK_DATA)
{
  describe("[Load Mock Data]", ()=>{      
    const storeMap = new Map<string,number>();

    it("load stores", async ()=> {  
      let loadedStores = 0;

      for(let store of data.stores) {        
        const storeId = generateRandomU16();
        storeMap.set(store.id, storeId);
        const storeStatus = store?.status ?? 0;

        const [mockStorePda, mockStorePdaBump] = PublicKey.findProgramAddressSync(
            [
              anchor.utils.bytes.utf8.encode("store"),
              creatorKeypair.publicKey.toBuffer(),
              Buffer.from(uIntToBytes(storeId,2,"setUint"))
            ], program.programId);

        const existingStore = await program.account.store.fetchNullable(mockStorePda);
        if(existingStore)
            continue;
        
        //console.log('-', storeId, ':', mockStorePda.toBase58());
        const storeName = store.displayName;
        const storeDescription = store.displayDescription;

        trimUndefined(store);
        const compressedStore = compress(store);
        //console.log('compressedStore: ', compressedStore);
        const dataString = JSON.stringify(compressedStore);
        //console.log('dataString: ', dataString);
        const tx = await program.methods
        .createStore(storeId, storeStatus, storeName.toLowerCase(), storeDescription.toLowerCase(), dataString)
        .accounts({
            store: mockStorePda,
            creator: creatorKeypair.publicKey,
            authority: creatorKeypair.publicKey,
            secondaryAuthority: secondaryAuthorityPubkey,
        })
        .transaction();

        const response = await anchor.web3
          .sendAndConfirmTransaction(provider.connection, tx, [creatorKeypair], {commitment: 'finalized'})
          .catch(err=>console.log(err));     
        loadedStores++;

        const createdStore = await program.account.store.fetch(mockStorePda);
        expect(createdStore.bump).is.equal(mockStorePdaBump);
        expect(createdStore.status).is.equal(storeStatus);
        expect(createdStore.id).is.equal(storeId);
        expect(createdStore.creator).is.eql(creatorKeypair.publicKey);
        expect(createdStore.authority).is.eql(creatorKeypair.publicKey);
        expect(createdStore.secondaryAuthority).is.eql(secondaryAuthorityPubkey);
        expect(createdStore.tag.toNumber()).is.equal(0);
        expect(createdStore.name).is.equal(storeName.toLowerCase());
        expect(createdStore.description).is.eql(storeDescription.toLowerCase());
        expect(createdStore.productCount.toNumber()).is.equal(0);  
        expect(createdStore.data).is.equal(dataString); 
      }

      expect(loadedStores).is.equal(data.stores.length);
    });

    it("load products", async ()=> {      
      let loadedProducts = 0;

      for(let product of data.products)
      {
        const mockProductId = generateRandomU32();
        const [mockProductPda, mockProductPdaBump] = PublicKey.findProgramAddressSync(
          [
            anchor.utils.bytes.utf8.encode("product"),
            creatorKeypair.publicKey.toBuffer(),                                                   
            Buffer.from(uIntToBytes(mockProductId,4,"setUint"))
          ], program.programId);

        const existingProduct = await program.account.product.fetchNullable(mockProductPda);
        if(existingProduct)
          continue;        

        //const mockProductMintKeypair = Keypair.generate();
        const mockStoreId = storeMap.has(product.storeId) ? storeMap.get(product.storeId) : null;
        //const productMintDecimals = product.decimals ?? 0;
        const productName = product.displayName;
        const productDescription = product.displayDescription;
        const productPrice = (product.price ?? 0) * 1000000;
        const productInventory = product.inventory ?? 0;
        const productRedemptionType = product.redemptionType ?? 1;
        const productStatus = product?.status ?? 0;

        const [mockStorePda, mockStorePdaBump] = PublicKey.findProgramAddressSync(
          [
            anchor.utils.bytes.utf8.encode("store"),
            creatorKeypair.publicKey.toBuffer(),                                              
            Buffer.from(uIntToBytes(mockStoreId,2,"setUint"))
          ], program.programId);
       
        trimUndefined(product);
        const compressedProduct= compress(product);        
        const dataString = JSON.stringify(compressedProduct);       
        let tx = null;

        if(mockStoreId){
          tx = await program.methods
                .createStoreProduct(mockProductId,
                    productStatus,
                    //productMintDecimals,
                    new BN(productPrice), 
                    new BN(productInventory),
                    productRedemptionType,
                    productName.toLowerCase(), 
                    productDescription.toLowerCase(),
                    dataString)
                .accounts({
                  //mint: mockProductMintKeypair.publicKey,
                  product: mockProductPda,
                  store: mockStorePda,
                  creator: creatorKeypair.publicKey,
                  authority: creatorKeypair.publicKey,
                  secondaryAuthority: secondaryAuthorityPubkey,
                  payTo: payToAccountPubkey,
                })
                .transaction();
        } 
        else {
          tx = await program.methods
                .createProduct(mockProductId, 
                    productStatus,
                    //productMintDecimals,
                    new BN(productPrice), 
                    new BN(productInventory),
                    productRedemptionType,
                    productName.toLowerCase(),
                    productDescription.toLowerCase(),        
                    dataString)
                .accounts({
                  //mint: mockProductMintKeypair.publicKey,
                  product: mockProductPda,
                  creator: creatorKeypair.publicKey,
                  authority: creatorKeypair.publicKey,
                  secondaryAuthority: secondaryAuthorityPubkey,
                  payTo: payToAccountPubkey,
                })
                .transaction();
        }
        

        tx.feePayer = creatorKeypair.publicKey;
        tx.recentBlockhash = (await provider.connection.getLatestBlockhash()).blockhash;
        tx.partialSign(creatorKeypair);
        
        const txid = await anchor.web3
          .sendAndConfirmTransaction(provider.connection, tx, [creatorKeypair], {commitment: 'finalized'})            
          .catch(err=>console.log(err));

        loadedProducts++;

        const createdProduct = await program.account.product.fetch(mockProductPda);
        expect(createdProduct.bump).is.equal(mockProductPdaBump);
        expect(createdProduct.status).is.equal(productStatus);
        expect(createdProduct.creator).is.eql(creatorKeypair.publicKey);
        expect(createdProduct.authority).is.eql(creatorKeypair.publicKey);
        expect(createdProduct.secondaryAuthority).is.eql(secondaryAuthorityPubkey);
        expect(createdProduct.id).is.equal(mockProductId); 
        expect(createdProduct.tag.toNumber()).is.equal(0); 
        //expect(createdProduct.mint).is.eql(mockProductMintKeypair.publicKey);
        expect(createdProduct.payTo).is.eql(payToAccountPubkey);
        expect(createdProduct.store).is.eql(mockStoreId ? mockStorePda : PublicKey.default); 
        expect(createdProduct.price.toNumber()).is.equal(productPrice);
        expect(createdProduct.inventory.toNumber()).is.equal(productInventory);
        expect(createdProduct.redemptionType).is.equal(productRedemptionType);
        expect(createdProduct.name).is.equal(productName.toLowerCase());
        expect(createdProduct.description).is.equal(productDescription.toLowerCase());
        expect(createdProduct.data).is.equal(dataString);
      }

      expect(loadedProducts).is.equal(data.products.length);
    }); //load products

  }); //mock data 

}//LOAD_MOCK_DATA


});
