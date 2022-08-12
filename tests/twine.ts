import * as anchor from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import { Twine } from "../target/types/twine";
import {PublicKey, Keypair, sendAndConfirmTransaction} from "@solana/web3.js";
import { assert, expect } from "chai";

describe("twine", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const ownerKeypair = Keypair.generate();
  const program = anchor.workspace.Twine as Program<Twine>;
  const [companyPda, companyPdaBump] = PublicKey
    .findProgramAddressSync([anchor.utils.bytes.utf8.encode("company"), ownerKeypair.publicKey.toBuffer()], program.programId);
  const [storePda, storePdaBump] = PublicKey
    .findProgramAddressSync([anchor.utils.bytes.utf8.encode("store"), ownerKeypair.publicKey.toBuffer()], program.programId);
  const storeName = "test-store";
  const storeDescription = "test-store description";

  it("Create Company", async () => {
    const tx = await program.methods
    .createCompany()
    .accounts({
      company: companyPda,
      payer: provider.publicKey,
      owner: ownerKeypair.publicKey
    })
    .rpc();

     //console.log("Your transaction signature", tx);
    const createdCompany = await program.account.company.fetch(companyPda);
    expect(createdCompany.bump).is.equal(companyPdaBump);
    expect(createdCompany.owner).is.eql(ownerKeypair.publicKey);
  });


  it("Create Store", async () => {
    const tx = await program.methods
    .createStore(storeName, storeDescription)
    .accounts({
      store: storePda,
      payer: provider.publicKey,
      owner: ownerKeypair.publicKey,
    })
    .rpc();

    //console.log("Your transaction signature", tx);    

    const createdStore = await program.account.store.fetch(storePda);
    expect(createdStore.bump).is.equal(storePdaBump);
    expect(createdStore.name).is.equal(storeName);
    expect(createdStore.description).is.equal(storeDescription);
    expect(createdStore.creator).is.eql(provider.publicKey);
    expect(createdStore.owner).is.eql(ownerKeypair.publicKey);    
    
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
    .updateStore(updatedStoreName, updatedStoreDescription)
    .accounts({
      store: storePda,
      owner: ownerKeypair.publicKey,
      payer: provider.publicKey,
    })
    .transaction();

    const txSucceeded = await provider.sendAndConfirm(txSuccess, [ownerKeypair]);
    //const txSucceeded = await sendAndConfirmTransaction(program.provider.connection, txSuccess, [provider]);

    const updatedStoreSuccess = await program.account.store.fetch(storePda);
    expect(updatedStoreSuccess.name).is.equal(updatedStoreName);
    expect(updatedStoreSuccess.description).is.equal(updatedStoreDescription);
  });
});
