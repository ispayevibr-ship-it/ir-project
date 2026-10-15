"use strict";
/* Creates a PUBLIC-ONLY registry proposal. Does not modify application trust,
 * generate keys, download files, or run tests. */
const fs=require("node:fs"),crypto=require("node:crypto");
function createRegistryEntry(publicKeyFile,keyId,expectedFingerprint){
 if(!/^[A-Za-z0-9_.-]{1,70}$/.test(keyId||""))throw Error("Invalid publisher key ID");
 if(!/^[a-f0-9]{64}$/.test(expectedFingerprint||""))throw Error("Expected SHA-256 SPKI fingerprint required");
 const pem=fs.readFileSync(publicKeyFile,"utf8");
 const key=crypto.createPublicKey(pem);
 if(key.asymmetricKeyType!=="ed25519")throw Error("Only Ed25519 public keys are allowed");
 const fingerprint=crypto.createHash("sha256").update(key.export({format:"der",type:"spki"})).digest("hex");
 if(fingerprint!==expectedFingerprint)throw Error("Publisher fingerprint mismatch; trust not granted");
 return {keyId,publicKeyPem:key.export({format:"pem",type:"spki"}),sha256Spki:fingerprint};
}
if(require.main===module){
 try{
  if(process.argv.length!==5)throw Error("Usage: node scripts/ai-publisher-registry-entry.js <public.pem> <key-id> <verified-sha256-spki>");
  process.stdout.write(JSON.stringify(createRegistryEntry(process.argv[2],process.argv[3],process.argv[4]),null,2)+"\n");
 }catch(e){console.error(e.message);process.exitCode=1}
}
module.exports={createRegistryEntry};
