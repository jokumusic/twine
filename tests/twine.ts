import * as anchor from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import { Twine } from "../target/types/twine";
import {PublicKey, Keypair, sendAndConfirmTransaction } from "@solana/web3.js";
import { assert, expect } from "chai";
import { bytes, rpc } from "@project-serum/anchor/dist/cjs/utils";

const ownerKeypair = Keypair.generate();
const provider = anchor.AnchorProvider.env();
anchor.setProvider(provider);

console.log('owner pubkey: ', ownerKeypair.publicKey.toBase58());


before((done) => {
  console.log('funding owner account');
  provider.connection
    .requestAirdrop(ownerKeypair.publicKey, 80_000_000)
    .then(signature=>{
      provider.connection
      .confirmTransaction(signature)
      .then(response=>done())
      .catch(err=>done(err));
    })
    .catch(err=>done(err));  
});

describe("twine", () => {
  const program = anchor.workspace.Twine as Program<Twine>;
  const [companyPda, companyPdaBump] = PublicKey
    .findProgramAddressSync([anchor.utils.bytes.utf8.encode("company"), ownerKeypair.publicKey.toBuffer()], program.programId);
  const [storePda, storePdaBump] = PublicKey
    .findProgramAddressSync([
      anchor.utils.bytes.utf8.encode("store"),
      ownerKeypair.publicKey.toBuffer(),
      companyPda.toBuffer(),
      new Uint8Array([0,0,0,0])], program.programId);
  const [store2Pda, store2PdaBump] = PublicKey.findProgramAddressSync([
                                                anchor.utils.bytes.utf8.encode("store"),
                                                ownerKeypair.publicKey.toBuffer(),
                                                companyPda.toBuffer(),
                                                new Uint8Array([0,0,0,1])], program.programId);
  const storeName = "test-store";
  const storeDescription = "test-store description";


  it("Create Company", async () => {
    const tx = await program.methods
    .createCompany()
    .accounts({
      company: companyPda,
      owner: ownerKeypair.publicKey,
    })
    .transaction()
  
    const response = await anchor.web3.sendAndConfirmTransaction(provider.connection, tx, [ownerKeypair]); //, sendOptions);
    //console.log('response: ', response);

     //console.log("Your transaction signature", tx);
    const createdCompany = await program.account.company.fetch(companyPda);
    expect(createdCompany.bump).is.equal(companyPdaBump);
    expect(createdCompany.owner).is.eql(ownerKeypair.publicKey);
    expect(createdCompany.storeCount).is.equal(0);
  });


  it("Create Store", async () => {
    const tx = await program.methods
    .createStore(storeName, storeDescription)
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
    //expect(createdStore.productCount).is.eql(new anchor.BN(0));  

    const storeCompany = await program.account.company.fetch(companyPda);
    expect(storeCompany.storeCount).is.equal(1);
  });


  it("Update Store", async () => {
    const updatedStoreName = storeName + "-updated";
    const updatedStoreDescription = storeDescription + "-updated";
    
    //this should fail because the owner is wrong
    /*
    const txfail = await program.methods
    .updateStore(updatedStoreName, updatedStoreName)
    .accounts({
      store: storePda,
      owner: ownerKeypair.publicKey,
    })
    .rpc();

    //console.log("Your transaction signature", txfail);    

    const updatedStoreFail = await program.account.store.fetch(storePda);
    expect(updatedStoreFail.name).is.equal(storeName);
    expect(updatedStoreFail.description).is.equal(storeDescription);
  */

    //this should succeed because the owner is correct
    const txSuccess = await program.methods
    .updateStore(0, updatedStoreName, updatedStoreDescription)
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
    .createStore(storeName, storeDescription)
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
    //expect(createdStore.productCount).is.eql(new anchor.BN(0));  

    const storeCompany = await program.account.company.fetch(companyPda);
    expect(storeCompany.storeCount).is.equal(2);
  });
});
