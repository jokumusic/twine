import * as anchor from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import { Twine } from "../target/types/twine";
import {PublicKey, Keypair, sendAndConfirmTransaction } from "@solana/web3.js";
import { assert, expect } from "chai";
import { bytes, rpc } from "@project-serum/anchor/dist/cjs/utils";
import { BN } from "bn.js";
import {TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, createMint} from "@solana/spl-token";
import * as spl_token from "@solana/spl-token";

const ownerKeypair = Keypair.generate();
const provider = anchor.AnchorProvider.env();
anchor.setProvider(provider);
console.log('owner pubkey: ', ownerKeypair.publicKey.toBase58());


describe("twine", () => {
  const program = anchor.workspace.Twine as Program<Twine>;
  let [metadataPda, metadataPdaBump] = PublicKey
    .findProgramAddressSync([anchor.utils.bytes.utf8.encode("metadata")], program.programId);
  let [companyPda, companyPdaBump] = PublicKey
    .findProgramAddressSync([anchor.utils.bytes.utf8.encode("company"), new Uint8Array([0,0,0,0])], program.programId);
  let [storePda, storePdaBump] = PublicKey.findProgramAddressSync([
      anchor.utils.bytes.utf8.encode("store"),                                                
      companyPda.toBuffer(),
      new Uint8Array([0,0,0,0])], program.programId);
  let [store2Pda, store2PdaBump] = PublicKey.findProgramAddressSync([
      anchor.utils.bytes.utf8.encode("store"),                                                
      companyPda.toBuffer(),
      new Uint8Array([0,0,0,1])], program.programId);

  let metadataAccount;
  let companyNumber = 0;
  const storeName = "test-store";
  const storeDescription = "test-store description";

  before((done) => {
    console.log('funding owner account');
    const airdropPromise = provider.connection.requestAirdrop(ownerKeypair.publicKey, 80_000_000);
    const getAccountInfoPromise = provider.connection.getAccountInfo(metadataPda);
  
    Promise
      .all([airdropPromise, getAccountInfoPromise])
      .then(async (data)=>{
        const airdropSignature = data[0];
        const accountInfo = data[1];
        //console.log('airdrop signature: ', airdropSignature);
        const response = await provider.connection.confirmTransaction(airdropSignature);
        if(accountInfo){
          metadataAccount = await program.account.metaData.fetch(metadataPda)
          companyNumber = metadataAccount ? metadataAccount.companyCount : 0;
          [companyPda, companyPdaBump] = PublicKey.findProgramAddressSync([
              anchor.utils.bytes.utf8.encode("company"),
              new Uint8Array([0,0,0,companyNumber])], program.programId); 
          
          [storePda, storePdaBump] = PublicKey.findProgramAddressSync([
              anchor.utils.bytes.utf8.encode("store"),
              companyPda.toBuffer(),
              new Uint8Array([0,0,0,0])], program.programId);

          [store2Pda, store2PdaBump] = PublicKey.findProgramAddressSync([
              anchor.utils.bytes.utf8.encode("store"),                                                
              companyPda.toBuffer(),
              new Uint8Array([0,0,0,1])], program.programId);
        }
        done();
      })
      .catch(err=>done(err));
  });


  it("Initialize Twine", async () =>{
    if(!metadataAccount) {
      console.log('initializing metadata: ', metadataPda.toBase58());
      const tx = await program.methods
        .initialize()
        .accounts({
          metadata: metadataPda,
          owner: ownerKeypair.publicKey,
        })
        .transaction();

        const response = await anchor.web3.sendAndConfirmTransaction(provider.connection, tx, [ownerKeypair]); //, sendOptions);
        //console.log('response: ', response);
  
        //console.log("Your transaction signature", tx);
        const metadata = await program.account.metaData.fetch(metadataPda);
        expect(metadata.bump).is.equal(metadataPdaBump);
        expect(metadata.companyCount).is.equal(0);
        console.log(`metadata.companyCount=${metadata.companyCount}, companyNumber=${companyNumber}`);
    } 
    else {
      console.log('metadata already exists');
      const metadata = await program.account.metaData.fetch(metadataPda);
      expect(metadata.bump).is.equal(metadataPdaBump);
      console.log(`metadata.companyCount=${metadata.companyCount}, companyNumber=${companyNumber}`);
    }
  });

  
  it("Create Company", async () => {
    const tx = await program.methods
    .createCompany()
    .accounts({
      company: companyPda,
      metadata: metadataPda,
      owner: ownerKeypair.publicKey,
    })
    .transaction()
  
    const response = await anchor.web3.sendAndConfirmTransaction(provider.connection, tx, [ownerKeypair]); //, sendOptions);
    //console.log('response: ', response);

     //console.log("Your transaction signature", tx);
  
    const createdCompany = await program.account.company.fetch(companyPda);
    expect(createdCompany.bump).is.equal(companyPdaBump);
    expect(createdCompany.companyNumber).is.equal(companyNumber);
    expect(createdCompany.owner).is.eql(ownerKeypair.publicKey);
    expect(createdCompany.storeCount).is.equal(0);

    const metadata = await program.account.metaData.fetch(metadataPda);
    expect(metadata.companyCount).is.equal(companyNumber + 1);
  });


  it("Create Store", async () => {
    const tx = await program.methods
    .createStore(companyNumber, storeName, storeDescription)
    .accounts({
      company: companyPda,
      store: storePda,
      owner: ownerKeypair.publicKey,
    })
    .transaction();

    const response = await anchor.web3.sendAndConfirmTransaction(provider.connection, tx, [ownerKeypair]);
    //console.log('response: ', response);

    const createdStore = await program.account.store.fetch(storePda);
    expect(createdStore.bump).is.equal(storePdaBump);
    expect(createdStore.storeNumber).is.equal(0);
    expect(createdStore.owner).is.eql(ownerKeypair.publicKey);    
    expect(createdStore.name).is.equal(storeName);
    expect(createdStore.description).is.eql(storeDescription);
    expect(createdStore.productCount.toNumber()).is.equal(0);  

    const storeCompany = await program.account.company.fetch(companyPda);
    expect(storeCompany.storeCount).is.equal(1);
  });

  it("Update Store", async () => {
    const updatedStoreName = storeName + "-updated";
    const updatedStoreDescription = storeDescription + "-updated";

    //this should succeed because the owner is correct
    const txSuccess = await program.methods
    .updateStore(companyNumber, 0, updatedStoreName, updatedStoreDescription)
    .accounts({
      company: companyPda,
      store: storePda,
      owner: ownerKeypair.publicKey,      
    })
    .transaction();

    const txSucceeded = await anchor.web3.sendAndConfirmTransaction(provider.connection, txSuccess, [ownerKeypair]);

    const updatedStoreSuccess = await program.account.store.fetch(storePda);
    expect(updatedStoreSuccess.name).is.equal(updatedStoreName);
    expect(updatedStoreSuccess.description).is.equal(updatedStoreDescription);
    expect(updatedStoreSuccess.storeNumber).is.equal(0);
    expect(updatedStoreSuccess.owner).is.eql(ownerKeypair.publicKey);
  });


  it("Create 2nd Store", async () => {
    const tx = await program.methods
    .createStore(companyNumber, storeName, storeDescription)
    .accounts({
      company: companyPda,
      store: store2Pda,
      owner: ownerKeypair.publicKey,
    })
    .transaction();

    const response = await anchor.web3.sendAndConfirmTransaction(provider.connection, tx, [ownerKeypair]);
    //console.log('response: ', response);

    const createdStore = await program.account.store.fetch(store2Pda);
    expect(createdStore.bump).is.equal(store2PdaBump);
    expect(createdStore.storeNumber).is.equal(1);
    expect(createdStore.owner).is.eql(ownerKeypair.publicKey);
    expect(createdStore.name).is.equal(storeName);
    expect(createdStore.description).is.eql(storeDescription);
    expect(createdStore.productCount.toNumber()).is.equal(0);  

    const storeCompany = await program.account.company.fetch(companyPda);
    expect(storeCompany.storeCount).is.equal(2);
  });


  it("Create Product", async () => {
    const storeNumber = 0;
    const productName = "test-product";
    const productDescription = "test-product-description";
    const productCost = new BN(100000);
    const productSku = "skubeedoo"
    const productMintDecimals = 3;

    const mintKeypair = Keypair.generate();
    console.log('mint address: ', mintKeypair.publicKey.toBase58());

    const [productPda, productPdaBump] = PublicKey.findProgramAddressSync([
      anchor.utils.bytes.utf8.encode("product"),
      storePda.toBuffer(),
      new Uint8Array([0,0,0,0,0,0,0,0])], program.programId);

    const [productMintPda, productMintPdaBump] = PublicKey.findProgramAddressSync([
      anchor.utils.bytes.utf8.encode("product_mint"),
      mintKeypair.publicKey.toBuffer()
    ], program.programId);

    const [mintProductRefPda, mintProductRefPdaBump] = PublicKey.findProgramAddressSync([
      anchor.utils.bytes.utf8.encode("mint_product_ref"),
      mintKeypair.publicKey.toBuffer()
    ], program.programId);


    const tx = await program.methods
    .createProduct(companyNumber, storeNumber, productMintDecimals, productName, productDescription, productCost, productSku)
    .accounts({
      mint: mintKeypair.publicKey,
      product: productPda,
      productMint: productMintPda,
      mintProductRef: mintProductRefPda,
      store: storePda,
      company: companyPda,
      owner: ownerKeypair.publicKey,
      tokenProgram: TOKEN_PROGRAM_ID,
      twineProgram: program.programId,
    })
    .transaction();

    const response = await anchor.web3.sendAndConfirmTransaction(provider.connection, tx, [ownerKeypair, mintKeypair]);
    //console.log('create_product response: ', response);

    const createdProduct = await program.account.product.fetch(productPda);
    expect(createdProduct.bump).is.equal(productPdaBump);
    expect(createdProduct.productNumber.toNumber()).is.equal(0); 
    expect(createdProduct.owner).is.eql(ownerKeypair.publicKey);
    expect(createdProduct.company).is.eql(companyPda); 
    expect(createdProduct.store).is.eql(storePda); 
    expect(createdProduct.name).is.equal(productName);
    expect(createdProduct.description).is.equal(productDescription)
    expect(createdProduct.cost.toNumber()).is.equal(productCost.toNumber());
    expect(createdProduct.sku).is.equal(productSku);

    const createdMintProductRef = await program.account.mintProductRef.fetch(mintProductRefPda);
    expect(createdMintProductRef.bump).is.equal(mintProductRefPdaBump);
    expect(createdMintProductRef.product).is.eql(productPda);

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
});
