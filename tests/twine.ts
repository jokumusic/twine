import * as anchor from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import { Twine } from "../target/types/twine";
import {PublicKey, Keypair, sendAndConfirmTransaction} from "@solana/web3.js";
import { assert, expect } from "chai";
import { bytes, publicKey, rpc } from "@project-serum/anchor/dist/cjs/utils";
import { BN } from "bn.js";
import {TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, createAccount} from "@solana/spl-token";
import * as spl_token from "@solana/spl-token";
import * as data from './data.json';
import { compress, decompress, trimUndefined, trimUndefinedRecursively } from 'compress-json'

const generateRandomU16 = () => {
  return Math.floor(Math.random() * Math.pow(2,16));
}

const generateRandomU32 = () => {
  return Math.floor(Math.random() * Math.pow(2,16));
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

///All of the following tests are oriented around a user program on a mobile/web app interacting with the program.
///Most of the time the user program has to send transactions to a separate wallet program...
const creatorKeypair = Keypair.generate();
const secondaryAuthority = new PublicKey("6vtSko9H2YNzDAs927n4oLVfGrY8ygHEDMrg5ShGyZQA");
const creatorAccountLamportsRequired = 300_000_000; // because it's funded by airdrop, must be less than or equal to 1_000_000_000
const paytoAccountLamportsRequired = 40_000_000; //funds transferred from creatorAccount

const provider = anchor.AnchorProvider.env();
anchor.setProvider(provider);
console.log('creator pubkey: ', creatorKeypair.publicKey.toBase58());
//console.log('payto: ', paytoKeypair.publicKey.toBase58());


describe("twine", () => {
  const program = anchor.workspace.Twine as Program<Twine>;
  const storeId = generateRandomU16();
  const storeName = "test-store";
  const storeDescription = "test-store description";
  
  const storeProductId = generateRandomU32();
  const loneProductId = generateRandomU32();
  const productName = "test-product";
  const productDescription = "test-product-description";
  const productPrice = new BN(100000);
  const productStatus = 1;
  const productInventory = new BN(5);

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
  let [loneProductPda, loneProductPdaBump] = PublicKey.findProgramAddressSync(
    [
      anchor.utils.bytes.utf8.encode("product"),
      creatorKeypair.publicKey.toBuffer(),
      Buffer.from(uIntToBytes(loneProductId,4,"setUint"))
    ], program.programId);

  /*
  let [storeProductMintPda, storeProductMintPdaBump] = PublicKey.findProgramAddressSync(
      [
        anchor.utils.bytes.utf8.encode("mint"),
        storeProductPda.toBuffer(),
      ], program.programId);

  let [loneProductMintPda, loneProductMintPdaBump] = PublicKey.findProgramAddressSync(
      [
        anchor.utils.bytes.utf8.encode("mint"),
        loneProductPda.toBuffer(),
      ], program.programId);
  */

  before(() => {
    return new Promise<void>(async (resolve,reject) => {
      console.log(`funding creator account with ${creatorAccountLamportsRequired} lamports...`);
      
      const airdropSignature = await provider.connection
        .requestAirdrop(creatorKeypair.publicKey, creatorAccountLamportsRequired)
        .catch(reject);

      if(!airdropSignature)
        return;   

      const airdropConfirmation = await provider.connection
        .confirmTransaction(airdropSignature,'confirmed')
        .catch(reject);

      if(!airdropConfirmation)
        return;
      
      /*
      console.log(`funding pay_to account with ${paytoAccountLamportsRequired} lamports...`);
      const transfer_tx = new anchor.web3.Transaction().add(
          anchor.web3.SystemProgram.transfer({
            fromPubkey: creatorKeypair.publicKey,
            toPubkey: paytoKeypair.publicKey,
            lamports: paytoAccountLamportsRequired,
          })
      );

      transfer_tx.recentBlockhash = (await provider.connection.getLatestBlockhash()).blockhash;
      transfer_tx.feePayer = creatorKeypair.publicKey;

      const transfer_results = await anchor.web3
      .sendAndConfirmTransaction(provider.connection, transfer_tx, [creatorKeypair], {commitment: 'confirmed'})
      .catch(reject);

      if(!transfer_results)
        return;
      */

      resolve();
    });
  });


  it("Initialize Program", async () => {
    let programMetadata = await program.account.programMetadata.fetchNullable(programMetadataPda);
    
    if(programMetadata) {
      console.log('program metadata is already initialized')
      return;
    }

    const tx = await program.methods
    .initialize()
    .accounts({
      programMetadata: programMetadataPda,
      creator: creatorKeypair.publicKey,
      authority: provider.publicKey,
      secondaryAuthority: secondaryAuthority,
      feeAccount: secondaryAuthority,
    })
    .transaction();

    const response = await anchor.web3.sendAndConfirmTransaction(provider.connection, tx, [creatorKeypair]);
    
    programMetadata = await program.account.programMetadata.fetch(programMetadataPda);
    expect(programMetadata.bump).is.equal(programMetadataPdaBump);
    expect(programMetadata.initialized).is.equal(true);
    expect(programMetadata.version).is.equal(0);
    expect(programMetadata.creator).is.eql(creatorKeypair.publicKey);
    expect(programMetadata.authority).is.eql(provider.publicKey);
    expect(programMetadata.secondaryAuthority).is.eql(secondaryAuthority);
    expect(programMetadata.feeAccount).is.eql(secondaryAuthority);
  });

  it("Create Store", async () => {
    const data = JSON.stringify(compress({displayName: storeName, displayDescription: storeDescription}));

    const tx = await program.methods
    .createStore(storeId, 1, storeName.toLowerCase(), storeDescription.toLowerCase(), data)
    .accounts({
      store: storePda,
      creator: creatorKeypair.publicKey,
      authority: creatorKeypair.publicKey,
      secondaryAuthority: secondaryAuthority,    
    })
    .transaction();

    const response = await anchor.web3.sendAndConfirmTransaction(provider.connection, tx, [creatorKeypair]);  

    const createdStore = await program.account.store.fetch(storePda);
    expect(createdStore.bump).is.equal(storePdaBump);
    expect(createdStore.status).is.equal(1);
    expect(createdStore.id).is.equal(storeId);
    expect(createdStore.creator).is.eql(creatorKeypair.publicKey);
    expect(createdStore.authority).is.eql(creatorKeypair.publicKey);
    expect(createdStore.secondaryAuthority).is.eql(secondaryAuthority);
    expect(createdStore.tag.toNumber()).is.equal(0);
    expect(createdStore.name).is.equal(storeName.toLowerCase());
    expect(createdStore.description).is.eql(storeDescription.toLowerCase());
    expect(createdStore.productCount.toNumber()).is.equal(0);  
    expect(createdStore.data).is.equal(data);
    
  });


  it("Update Store", async () => {
    const updatedStoreName = storeName + "-updated";
    const updatedStoreDescription = storeDescription + "-updated";
    const data = JSON.stringify({displayName: updatedStoreName, displayDescription: updatedStoreDescription});

    //this should succeed because the owner is correct
    const tx = await program.methods
    .updateStore(updatedStoreName.toLowerCase(), updatedStoreDescription.toLowerCase(), data)
    .accounts({
      store: storePda,
      authority: creatorKeypair.publicKey,
    })
    .transaction();

    const response = await anchor.web3.sendAndConfirmTransaction(provider.connection, tx, [creatorKeypair]);

    const updatedStore= await program.account.store.fetch(storePda);
    expect(updatedStore.bump).is.equal(storePdaBump);
    expect(updatedStore.status).is.equal(1);
    expect(updatedStore.creator).is.eql(creatorKeypair.publicKey);
    expect(updatedStore.authority).is.eql(creatorKeypair.publicKey);
    expect(updatedStore.secondaryAuthority).is.eql(secondaryAuthority);
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
    const redemptionType = 0;

    const tx = await program.methods
      .createStoreProduct(storeProductId, productStatus, //productMintDecimals, 
      productPrice, productInventory, redemptionType, productName.toLowerCase(), productDescription.toLowerCase(), data)
      .accounts({
        //mint: storeProductMintPda,
        product: storeProductPda,
        store: storePda,
        creator: creatorKeypair.publicKey,
        authority: creatorKeypair.publicKey,
        secondaryAuthority: secondaryAuthority,  
        payTo: secondaryAuthority,
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
    expect(createdProduct.secondaryAuthority).is.eql(secondaryAuthority);
    expect(createdProduct.id).is.equal(storeProductId); 
    expect(createdProduct.tag.toNumber()).is.equal(0); 
    //expect(createdProduct.mint).is.eql(storeProductMintPda);
    expect(createdProduct.payTo).is.eql(secondaryAuthority);
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
    const updatedProductStatus = 0;
    const updatedProductName = productName + "-updated";
    const updatedProductDescription = productDescription + "-updated";
    const updatedProductPrice = 200000;
    const updatedProductInventory = 2;
    const updatedProductData = JSON.stringify({displayName: updatedProductName, displayDescription: updatedProductDescription});
    const updatedRedemptionType = 1;

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
    expect(updatedProduct.secondaryAuthority).is.eql(secondaryAuthority);
    expect(updatedProduct.id).is.equal(storeProductId);
    expect(updatedProduct.tag.toNumber()).is.equal(0); 
    //expect(updatedProduct.mint).is.eql(storeProductMintPda);
    expect(updatedProduct.payTo).is.eql(secondaryAuthority);
    expect(updatedProduct.store).is.eql(storePda); 
    expect(updatedProduct.price.toNumber()).is.equal(updatedProductPrice);
    expect(updatedProduct.inventory.toNumber()).is.equal(updatedProductInventory);
    expect(updatedProduct.name).is.equal(updatedProductName.toLowerCase());
    expect(updatedProduct.description).is.equal(updatedProductDescription.toLowerCase());
    expect(updatedProduct.data).is.equal(updatedProductData);
  });


  it("Create Lone Product", async () => {    
    //const productMintDecimals = 3;
    const data = JSON.stringify({displayName: productName, displayDescription: productDescription});
    const redemptionType = 1;

    const tx = await program.methods
    .createProduct(loneProductId, productStatus, //productMintDecimals,
     productPrice, productInventory, redemptionType, productName.toLowerCase(), productDescription.toLowerCase(), data)
    .accounts({
      //mint: loneProductMintPda,
      product: loneProductPda,
      creator: creatorKeypair.publicKey,
      authority: creatorKeypair.publicKey,
      secondaryAuthority: secondaryAuthority,
      payTo: secondaryAuthority,
      //tokenProgram: TOKEN_PROGRAM_ID,
    })
    .transaction();
   
    const response = await anchor.web3.sendAndConfirmTransaction(provider.connection, tx, [creatorKeypair]);

    const createdProduct = await program.account.product.fetch(loneProductPda);
    expect(createdProduct.bump).is.equal(loneProductPdaBump);
    expect(createdProduct.status).is.equal(productStatus);
    expect(createdProduct.creator).is.eql(creatorKeypair.publicKey);
    expect(createdProduct.authority).is.eql(creatorKeypair.publicKey);
    expect(createdProduct.secondaryAuthority).is.eql(secondaryAuthority);
    expect(createdProduct.id).is.equal(loneProductId); 
    expect(createdProduct.tag.toNumber()).is.equal(0); 
    expect(createdProduct.isSnapshot).is.equal(false); 
    //expect(createdProduct.mint).is.eql(loneProductMintPda);
    expect(createdProduct.payTo).is.eql(secondaryAuthority);
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


  it("Buy Lone Product", async () => {
    let buyForPubkey = creatorKeypair.publicKey;
    //let buyForAta = await spl_token.getAssociatedTokenAddress(
    //  loneProductMintPda,
    //  buyForPubkey,
    //);

    const loneProduct = await program.account.product.fetch(loneProductPda);
    const quantity = 1;
    const nonce = generateRandomU16();

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

    const transferToPurchaseTicketIx = anchor.web3.SystemProgram.transfer({
      fromPubkey: creatorKeypair.publicKey,
      toPubkey: purchaseTicketPda,
      lamports: 20_000_000
    });

    const buyProductIx = await program.methods
      .buyProduct(nonce, new BN(quantity), loneProduct.price)
      .accounts({
        //mint: loneProduct.mint,
        product: loneProductPda,
        productSnapshotMetadata: productSnapshotMetadataPda,
        productSnapshot: productSnapshotPda,
        buyer: creatorKeypair.publicKey,
        buyFor: secondaryAuthority,
        payTo: secondaryAuthority,
        purchaseTicket: purchaseTicketPda,
        //clock: SYSVAR_CLOCK_PUBKEY,
      })
      .instruction();

    const tx = new anchor.web3.Transaction()
    .add(transferToPurchaseTicketIx)
    .add(buyProductIx);

    tx.recentBlockhash = (await provider.connection.getLatestBlockhash()).blockhash;
    tx.feePayer = creatorKeypair.publicKey;  

    const response = await anchor.web3.sendAndConfirmTransaction(provider.connection, tx, [creatorKeypair]);

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
    expect(purchaseTicket.authority).is.eql(secondaryAuthority);
    expect(purchaseTicket.redeemed.toNumber()).is.equal(0);
    expect(purchaseTicket.nonce).is.equal(nonce);
  
    
    //const mintAccount = await spl_token.getMint(provider.connection, loneProduct.mint,'confirmed', TOKEN_PROGRAM_ID);  
    //expect(mintAccount.supply).is.equal(BigInt(quantity));
    
    //const buyForAccount = await spl_token.getAccount(provider.connection, buyForAta, 'confirmed', TOKEN_PROGRAM_ID);
    //expect(buyForAccount.address).is.eql(buyForAta);
    //expect(buyForAccount.amount).is.equal(BigInt(quantity));
    //expect(buyForAccount.owner).is.eql(creatorKeypair.publicKey);
    //expect(buyForAccount.mint).is.eql(loneProduct.mint);
  });


  it("Update Lone Product", async () => {
    const updatedProductName = productName + "-updated";
    const updatedProductDescription = productDescription + "-updated";
    const updatedProductPrice = 200000;
    const updatedData = JSON.stringify({displayName: updatedProductName, displayDescription: updatedProductDescription});
    const updatedStatus = 0;
    const updatedInventory = 3;
    const updatedRedemptionType = 2;

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
    expect(updatedProduct.secondaryAuthority).is.eql(secondaryAuthority);
    expect(updatedProduct.id).is.equal(loneProductId);
    expect(updatedProduct.tag.toNumber()).is.equal(0); 
    //expect(updatedProduct.mint).is.eql(loneProductMintPda);
    expect(updatedProduct.usableSnapshot).is.eql(PublicKey.default);
    expect(updatedProduct.payTo).is.eql(secondaryAuthority);
    expect(updatedProduct.store).is.eql(PublicKey.default); 
    expect(updatedProduct.price.toNumber()).is.equal(updatedProductPrice);
    expect(updatedProduct.inventory.toNumber()).is.equal(updatedInventory);
    expect(updatedProduct.redemptionType).is.equal(updatedRedemptionType);
    expect(updatedProduct.name).is.equal(updatedProductName.toLowerCase());
    expect(updatedProduct.description).is.equal(updatedProductDescription.toLowerCase());
    expect(updatedProduct.data).is.equal(updatedData);
  });


  describe("Mock Data", ()=>{      
    const storeMap = new Map<string,number>();

    it("load stores", async ()=> {  
      let loadedStores = 0;

      for(let store of data.stores) {        
        const storeId = generateRandomU16();
        storeMap.set(store.id, storeId);

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
        .createStore(storeId, 1, storeName.toLowerCase(), storeDescription.toLowerCase(), dataString)
        .accounts({
            store: mockStorePda,
            creator: creatorKeypair.publicKey,
            authority: creatorKeypair.publicKey,
            secondaryAuthority: secondaryAuthority,
        })
        .transaction();

        const response = await anchor.web3
          .sendAndConfirmTransaction(provider.connection, tx, [creatorKeypair])
          .catch(err=>console.log(err));     
        loadedStores++;

        const createdStore = await program.account.store.fetch(mockStorePda);
        expect(createdStore.bump).is.equal(mockStorePdaBump);
        expect(createdStore.status).is.equal(1);
        expect(createdStore.id).is.equal(storeId);
        expect(createdStore.creator).is.eql(creatorKeypair.publicKey);
        expect(createdStore.authority).is.eql(creatorKeypair.publicKey);
        expect(createdStore.secondaryAuthority).is.eql(secondaryAuthority);
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
        const productPrice = product.price ?? 0;
        const productInventory = product.inventory ?? 0;
        const productRedemptionType = product.redemptionType ?? 0;

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
                    1,
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
                  secondaryAuthority: secondaryAuthority,
                  payTo: secondaryAuthority,
                })
                .transaction();
        } 
        else {
          tx = await program.methods
                .createProduct(mockProductId, 
                    1,
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
                  secondaryAuthority: secondaryAuthority,
                  payTo: secondaryAuthority,
                })
                .transaction();
        }
        

        tx.feePayer = creatorKeypair.publicKey;
        tx.recentBlockhash = (await provider.connection.getLatestBlockhash()).blockhash;
        tx.partialSign(creatorKeypair);
        
        const txid = await anchor.web3
          .sendAndConfirmRawTransaction(provider.connection, 
            tx.serialize({
                requireAllSignatures: true,
                verifySignatures: true,
                
            }), 
            {skipPreflight: true, commitment: 'confirmed'}
          )
          .catch(err=>console.log(err));

        loadedProducts++;

        const createdProduct = await program.account.product.fetch(mockProductPda);
        expect(createdProduct.bump).is.equal(mockProductPdaBump);
        expect(createdProduct.status).is.equal(1);
        expect(createdProduct.creator).is.eql(creatorKeypair.publicKey);
        expect(createdProduct.authority).is.eql(creatorKeypair.publicKey);
        expect(createdProduct.secondaryAuthority).is.eql(secondaryAuthority);
        expect(createdProduct.id).is.equal(mockProductId); 
        expect(createdProduct.tag.toNumber()).is.equal(0); 
        //expect(createdProduct.mint).is.eql(mockProductMintKeypair.publicKey);
        expect(createdProduct.payTo).is.eql(secondaryAuthority);
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


});
