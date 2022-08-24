import * as anchor from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import { Twine } from "../target/types/twine";
import {PublicKey, Keypair, sendAndConfirmTransaction } from "@solana/web3.js";
import { assert, expect } from "chai";
import { bytes, rpc } from "@project-serum/anchor/dist/cjs/utils";
import { BN } from "bn.js";
import {TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, createMint} from "@solana/spl-token";
import * as spl_token from "@solana/spl-token";
import * as data from './data.json';
import { compress, decompress, trimUndefined, trimUndefinedRecursively } from 'compress-json'

const generateRandomString = (length: number) => {
  const char = 'AaBbCcDdEeFfGgHhIiJjKkLlMmNnOoPpQqRrSsTtUuVvWwXxYyZz1234567890';
  const random = Array.from(
      {length: length},
      () => char[Math.floor(Math.random() * char.length)]
  );
  const randomString = random.join("");
  return randomString;
}

///All of the following tests are oriented around a user program on a mobile/web app interacting with the program.
///Most of the time the user program has to send transactions to a separate wallet program...
const ownerKeypair = Keypair.generate();
const provider = anchor.AnchorProvider.env();
anchor.setProvider(provider);
console.log('owner pubkey: ', ownerKeypair.publicKey.toBase58());


describe("twine", () => {
  const program = anchor.workspace.Twine as Program<Twine>;
  const storeId = generateRandomString(12);
  const storeName = "test-store";
  const storeDescription = "test-store description";
  
  const storeProductId = generateRandomString(12);
  const loneProductId = generateRandomString(12);
  const productName = "test-product";
  const productDescription = "test-product-description";
  const productCost = new BN(100000);
  const productSku = "skubeedoo"

  let [storePda, storePdaBump] = PublicKey.findProgramAddressSync(
    [
      anchor.utils.bytes.utf8.encode("store"),                                                
      anchor.utils.bytes.utf8.encode(storeId)
    ], program.programId);
  let [storeProductPda, storeProductPdaBump] = PublicKey.findProgramAddressSync(
    [
      anchor.utils.bytes.utf8.encode("product"),
      anchor.utils.bytes.utf8.encode(storeProductId)
    ], program.programId);
  let [loneProductPda, loneProductPdaBump] = PublicKey.findProgramAddressSync(
    [
      anchor.utils.bytes.utf8.encode("product"),
      anchor.utils.bytes.utf8.encode(loneProductId)
    ], program.programId);


  before((done) => {
    console.log('funding owner account');
    provider.connection
      .requestAirdrop(ownerKeypair.publicKey, 140_000_000)
      .then(async(signature) =>{
        const response = await provider.connection.confirmTransaction(signature);
        done();
      })
      .catch(err=>done(err));
  });


  it("Create Store", async () => {
    const data = "";

    const tx = await program.methods
    .createStore(storeId, storeName, storeDescription,"")
    .accounts({
      store: storePda,
      owner: ownerKeypair.publicKey,
    })
    .transaction();

    const response = await anchor.web3.sendAndConfirmTransaction(provider.connection, tx, [ownerKeypair]);
    
    const createdStore = await program.account.store.fetch(storePda);
    expect(createdStore.bump).is.equal(storePdaBump);
    expect(createdStore.storeId).is.equal(storeId);
    expect(createdStore.owner).is.eql(ownerKeypair.publicKey);
    expect(createdStore.name).is.equal(storeName);
    expect(createdStore.description).is.eql(storeDescription);
    expect(createdStore.productCount.toNumber()).is.equal(0);  
    expect(createdStore.data).is.equal(data);
  });


  it("Update Store", async () => {
    const updatedStoreName = storeName + "-updated";
    const updatedStoreDescription = storeDescription + "-updated";
    const data = JSON.stringify({updated: true});

    //this should succeed because the owner is correct
    const tx = await program.methods
    .updateStore(updatedStoreName, updatedStoreDescription, data)
    .accounts({
      store: storePda,
      owner: ownerKeypair.publicKey,      
    })
    .transaction();

    const response = await anchor.web3.sendAndConfirmTransaction(provider.connection, tx, [ownerKeypair]);

    const updatedStore= await program.account.store.fetch(storePda);
    expect(updatedStore.bump).is.equal(storePdaBump);
    expect(updatedStore.storeId).is.equal(storeId);
    expect(updatedStore.name).is.equal(updatedStoreName);
    expect(updatedStore.description).is.equal(updatedStoreDescription);
    expect(updatedStore.owner).is.eql(ownerKeypair.publicKey);
    expect(updatedStore.data).is.eql(data);
  });



  it("Create Store Product", async () => {    
    const productMintDecimals = 3;
    const mintKeypair = Keypair.generate();
    const data="";
    
    const [productMintPda, productMintPdaBump] = PublicKey.findProgramAddressSync([
      anchor.utils.bytes.utf8.encode("product_mint"),
      mintKeypair.publicKey.toBuffer()
    ], program.programId);

    const [mintProductRefPda, mintProductRefPdaBump] = PublicKey.findProgramAddressSync([
      anchor.utils.bytes.utf8.encode("mint_product_ref"),
      mintKeypair.publicKey.toBuffer()
    ], program.programId);


    const tx = await program.methods
    .createStoreProduct(storeProductId, productMintDecimals, productName, productDescription, productCost, productSku, data)
    .accounts({
      mint: mintKeypair.publicKey,
      product: storeProductPda,
      productMint: productMintPda,
      mintProductRef: mintProductRefPda,
      store: storePda,
      owner: ownerKeypair.publicKey,
      tokenProgram: TOKEN_PROGRAM_ID,
      twineProgram: program.programId,
    })
    .transaction();
   
    //setting feepayer,recentblockhash and then partialsigning is being done here, because that's the way it has to be done by mobile/web app client
    //because they have to use a separate wallet program for signing
    tx.feePayer = ownerKeypair.publicKey;
    tx.recentBlockhash = (await provider.connection.getLatestBlockhash()).blockhash;
    tx.partialSign(mintKeypair)    
    tx.partialSign(ownerKeypair); //this is where the wallet would be called to sign the transaction
    
    const txid = await anchor.web3.sendAndConfirmRawTransaction(provider.connection, 
      tx.serialize({
          requireAllSignatures: true,
          verifySignatures: true,
      }), {skipPreflight: true});

    //console.log('txid: ', txid);
    //const response = await anchor.web3.sendAndConfirmTransaction(provider.connection, tx, [ownerKeypair]);
    //console.log('create_product response: ', response);

    const createdProduct = await program.account.product.fetch(storeProductPda);
    expect(createdProduct.bump).is.equal(storeProductPdaBump);
    expect(createdProduct.productId).is.equal(storeProductId); 
    expect(createdProduct.owner).is.eql(ownerKeypair.publicKey);
    expect(createdProduct.store).is.eql(storePda); 
    expect(createdProduct.name).is.equal(productName);
    expect(createdProduct.description).is.equal(productDescription)
    expect(createdProduct.cost.toNumber()).is.equal(productCost.toNumber());
    expect(createdProduct.sku).is.equal(productSku);
    expect(createdProduct.data).is.equal(data);

    const createdMintProductRef = await program.account.mintProductRef.fetch(mintProductRefPda);
    expect(createdMintProductRef.bump).is.equal(mintProductRefPdaBump);
    expect(createdMintProductRef.product).is.eql(storeProductPda);

    const store = await program.account.store.fetch(storePda);
    expect(store.productCount.toNumber()).is.equal(1);

    const mintAccount = await spl_token.getMint(provider.connection, mintKeypair.publicKey,'confirmed', TOKEN_PROGRAM_ID);
    expect(mintAccount.address).is.eql(mintKeypair.publicKey)
    expect(mintAccount.decimals).is.equal(productMintDecimals);
    expect(mintAccount.supply).is.equal(BigInt(0));
    expect(mintAccount.freezeAuthority).is.eql(ownerKeypair.publicKey);
    expect(mintAccount.mintAuthority).is.eql(ownerKeypair.publicKey);
    expect(mintAccount.isInitialized).is.equal(true);    
  });

  
  it("Update Store Product", async () => {
    const updatedProductName = productName + "-updated";
    const updatedProductDescription = productDescription + "-updated";
    const updatedProductSku = productSku + "-updated";
    const updatedProductCost = 200000;
    const data = JSON.stringify({updated:true});

    //this should succeed because the owner is correct
    const txSuccess = await program.methods
    .updateProduct(updatedProductName, updatedProductDescription, new BN(updatedProductCost), updatedProductSku, data)
    .accounts({
      product: storeProductPda,
      owner: ownerKeypair.publicKey,      
    })
    .transaction();

    const txSucceeded = await anchor.web3.sendAndConfirmTransaction(provider.connection, txSuccess, [ownerKeypair]);

    const updatedProduct = await program.account.product.fetch(storeProductPda);
    expect(updatedProduct.bump).is.equal(storeProductPdaBump);
    expect(updatedProduct.productId).is.equal(storeProductId);
    expect(updatedProduct.description).is.equal(updatedProductDescription);
    expect(updatedProduct.cost.toNumber()).is.equal(updatedProductCost);
    expect(updatedProduct.sku).is.equal(updatedProductSku);
    expect(updatedProduct.owner).is.eql(ownerKeypair.publicKey);
    expect(updatedProduct.data).is.equal(data);
  });


  it("Create Lone Product", async () => {    
    const productMintDecimals = 3;
    const mintKeypair = Keypair.generate();
    const data="";

    const [productMintPda, productMintPdaBump] = PublicKey.findProgramAddressSync([
      anchor.utils.bytes.utf8.encode("product_mint"),
      mintKeypair.publicKey.toBuffer()
    ], program.programId);

    const [mintProductRefPda, mintProductRefPdaBump] = PublicKey.findProgramAddressSync([
      anchor.utils.bytes.utf8.encode("mint_product_ref"),
      mintKeypair.publicKey.toBuffer()
    ], program.programId);

    const tx = await program.methods
    .createProduct(loneProductId, productMintDecimals, productName, productDescription, productCost, productSku, data)
    .accounts({
      mint: mintKeypair.publicKey,
      product: loneProductPda,
      productMint: productMintPda,
      mintProductRef: mintProductRefPda,
      owner: ownerKeypair.publicKey,
      tokenProgram: TOKEN_PROGRAM_ID,
      twineProgram: program.programId,
    })
    .transaction();
   
    //setting feepayer,recentblockhash and then partialsigning is being done here, because that's the way it has to be done by mobile/web app client
    //because they have to use a separate wallet program for signing
    tx.feePayer = ownerKeypair.publicKey;
    tx.recentBlockhash = (await provider.connection.getLatestBlockhash()).blockhash;
    tx.partialSign(mintKeypair)    
    tx.partialSign(ownerKeypair); //this is where the wallet would be called to sign the transaction
    
    const txid = await anchor.web3.sendAndConfirmRawTransaction(provider.connection, 
      tx.serialize({
          requireAllSignatures: true,
          verifySignatures: true,
      }), {skipPreflight: true});

    //console.log('txid: ', txid);
    //const response = await anchor.web3.sendAndConfirmTransaction(provider.connection, tx, [ownerKeypair]);
    //console.log('create_product response: ', response);

    const createdProduct = await program.account.product.fetch(loneProductPda);
    expect(createdProduct.bump).is.equal(loneProductPdaBump);
    expect(createdProduct.productId).is.equal(loneProductId); 
    expect(createdProduct.owner).is.eql(ownerKeypair.publicKey);
    expect(createdProduct.store).is.equal(null); 
    expect(createdProduct.name).is.equal(productName);
    expect(createdProduct.description).is.equal(productDescription)
    expect(createdProduct.cost.toNumber()).is.equal(productCost.toNumber());
    expect(createdProduct.sku).is.equal(productSku);
    expect(createdProduct.data).is.equal(data);

    const createdMintProductRef = await program.account.mintProductRef.fetch(mintProductRefPda);
    expect(createdMintProductRef.bump).is.equal(mintProductRefPdaBump);
    expect(createdMintProductRef.product).is.eql(loneProductPda);

    const store = await program.account.store.fetch(storePda);
    expect(store.productCount.toNumber()).is.equal(1);

    const mintAccount = await spl_token.getMint(provider.connection, mintKeypair.publicKey,'confirmed', TOKEN_PROGRAM_ID);
    expect(mintAccount.address).is.eql(mintKeypair.publicKey)
    expect(mintAccount.decimals).is.equal(productMintDecimals);
    expect(mintAccount.supply).is.equal(BigInt(0));
    expect(mintAccount.freezeAuthority).is.eql(ownerKeypair.publicKey);
    expect(mintAccount.mintAuthority).is.eql(ownerKeypair.publicKey);
    expect(mintAccount.isInitialized).is.equal(true);    
  });


  it("Update Lone Product", async () => {
    const updatedProductName = productName + "-updated";
    const updatedProductDescription = productDescription + "-updated";
    const updatedProductSku = productSku + "-updated";
    const updatedProductCost = 200000;
    const updatedData = JSON.stringify({updated: true});

    //this should succeed because the owner is correct
    const txSuccess = await program.methods
    .updateProduct(updatedProductName, updatedProductDescription, new BN(updatedProductCost), updatedProductSku, updatedData)
    .accounts({
      product: loneProductPda,
      owner: ownerKeypair.publicKey,      
    })
    .transaction();

    const txSucceeded = await anchor.web3.sendAndConfirmTransaction(provider.connection, txSuccess, [ownerKeypair]);

    const updatedProduct = await program.account.product.fetch(loneProductPda);
    expect(updatedProduct.bump).is.equal(loneProductPdaBump);
    expect(updatedProduct.productId).is.equal(loneProductId);
    expect(updatedProduct.store).is.equal(null); 
    expect(updatedProduct.description).is.equal(updatedProductDescription);
    expect(updatedProduct.cost.toNumber()).is.equal(updatedProductCost);
    expect(updatedProduct.sku).is.equal(updatedProductSku);
    expect(updatedProduct.owner).is.eql(ownerKeypair.publicKey);
    expect(updatedProduct.data).is.equal(updatedData);
  });


  describe("Mock Data", ()=>{
      
    it("load stores", async ()=> {

      for(let store of data.stores) {
        const storeId = store.id;        
        const [mockStorePda, mockStorePdaBump] = PublicKey.findProgramAddressSync(
            [
            anchor.utils.bytes.utf8.encode("store"),                                                
            anchor.utils.bytes.utf8.encode(storeId)
            ], program.programId);

        const existingStore = await program.account.store.fetchNullable(mockStorePda);
        if(existingStore)
            continue;
        
        //console.log('-', storeId, ':', mockStorePda.toBase58());

        trimUndefined(store);
        const compressedStore = compress(store);
        //console.log('compressedStore: ', compressedStore);
        const dataString = JSON.stringify(compressedStore);
        //console.log('dataString: ', dataString);
        const tx = await program.methods
        .createStore(storeId, store.name, store.description, dataString)
        .accounts({
            store: mockStorePda,
            owner: ownerKeypair.publicKey,
        })
        .transaction();

        const response = await anchor.web3.sendAndConfirmTransaction(provider.connection, tx, [ownerKeypair]);     
        
        const createdStore = await program.account.store.fetch(mockStorePda);
        expect(createdStore.storeId).is.equal(storeId);
        expect(createdStore.name).is.equal(store.name);
        expect(createdStore.description).is.equal(store.description);
        expect(createdStore.data).is.equal(dataString);      
      }

    });

    it("load products", async ()=> {      
      
      for(let product of data.products)
      {        
        const productId = product.id;
        const [productPda, productPdaBump] = PublicKey.findProgramAddressSync(
          [
            anchor.utils.bytes.utf8.encode("product"),                                                
            anchor.utils.bytes.utf8.encode(productId)
          ], program.programId);

        const existingProduct = program.account.product.fetchNullable(productPda);
        if(existingProduct)
          continue;

        const mintKeypair = Keypair.generate();
        const storeId = product.storeId;
        const productMintDecimals = product.decimals ?? 0;
        const productName = product.name;
        const productDescription = product.description;
        const productPrice = product.price ?? 0;
        const productSku = product.sku ?? ""; 

        const [productMintPda, productMintPdaBump] = PublicKey.findProgramAddressSync(
          [
            anchor.utils.bytes.utf8.encode("product_mint"),
            mintKeypair.publicKey.toBuffer()
          ], program.programId);
    
        const [mintProductRefPda, mintProductRefPdaBump] = PublicKey.findProgramAddressSync(
          [
            anchor.utils.bytes.utf8.encode("mint_product_ref"),
            mintKeypair.publicKey.toBuffer()
          ], program.programId);
       
        trimUndefined(product);
        const compressedProduct= compress(product);        
        const dataString = JSON.stringify(compressedProduct);       
        let tx = null;

        if(storeId){
          const [storePda, storePdaBump] = PublicKey.findProgramAddressSync(
            [
              anchor.utils.bytes.utf8.encode("store"),                                                
              anchor.utils.bytes.utf8.encode(storeId)
            ], program.programId);

            console.log('product.storeId: ', product.storeId);
            console.log('storeId: ', storeId);
            console.log('pda: ', storePda.toBase58());

          tx = await program.methods
                .createStoreProduct(productId, 
                    productMintDecimals,
                    productName, 
                    productDescription, 
                    new BN(productPrice), 
                    productSku,
                    dataString)
                .accounts({
                    mint: mintKeypair.publicKey,
                    product: productPda,
                    productMint: productMintPda,
                    mintProductRef: mintProductRefPda,
                    store: storePda,
                    owner: ownerKeypair.publicKey,
                    tokenProgram: TOKEN_PROGRAM_ID,
                    twineProgram: program.programId,
                })
                .transaction();
        } 
        else {
          tx = await program.methods
                .createProduct(productId, 
                    productMintDecimals,
                    productName, 
                    productDescription, 
                    new BN(productPrice), 
                    productSku,
                    dataString)
                .accounts({
                    mint: mintKeypair.publicKey,
                    product: productPda,
                    productMint: productMintPda,
                    mintProductRef: mintProductRefPda,
                    owner: ownerKeypair.publicKey,
                    tokenProgram: TOKEN_PROGRAM_ID,
                    twineProgram: program.programId,
                })
                .transaction();
        }
        
        tx.feePayer = ownerKeypair.publicKey;
        tx.recentBlockhash = (await provider.connection.getLatestBlockhash()).blockhash;
        tx.partialSign(mintKeypair)    
        tx.partialSign(ownerKeypair);
        
        const txid = await anchor.web3.sendAndConfirmRawTransaction(provider.connection, 
          tx.serialize({
              requireAllSignatures: true,
              verifySignatures: true,
          }), {skipPreflight: true});

        //console.log('tx: ', tx);
        const response = await anchor.web3.sendAndConfirmTransaction(provider.connection, tx, [ownerKeypair]);     
        
        const createdProduct = await program.account.store.fetch(productPda);
        expect(createdProduct.bump).is.equal(productPdaBump);
        expect(createdProduct.productId).is.equal(productId); 
        expect(createdProduct.owner).is.eql(ownerKeypair.publicKey);
        expect(createdProduct.name).is.equal(productName);
        expect(createdProduct.description).is.equal(productDescription)
        expect(createdProduct.cost.toNumber()).is.equal(productPrice);
        expect(createdProduct.sku).is.equal(productSku);
        expect(createdProduct.data).is.equal(dataString);     
      }
    }); //load products

  }); //mock data

});
