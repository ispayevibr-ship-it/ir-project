"use strict";
/* Bundled publisher trust registry: public keys only. No runtime imports,
 * environment overrides or remote trust-on-first-use. */
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
function loadTrustedPublisherKeys(registryFile=path.join(__dirname,"ai-trusted-publishers.json")){
 const raw=JSON.parse(fs.readFileSync(registryFile,"utf8"));
 if(raw.schema!==1||!Array.isArray(raw.publishers))throw Error("Invalid publisher registry");
 const keys=Object.create(null);
 for(const item of raw.publishers){
  if(!item||!/^[A-Za-z0-9_.-]{1,70}$/.test(item.keyId||"")||
   typeof item.publicKeyPem!=="string"||!/^[a-f0-9]{64}$/.test(item.sha256Spki||""))
   throw Error("Invalid publisher identity");
  if(Object.hasOwn(keys,item.keyId))throw Error("Duplicate publisher key ID");
  const key=crypto.createPublicKey(item.publicKeyPem);
  if(key.asymmetricKeyType!=="ed25519")throw Error("Publisher key must be Ed25519");
  const actual=crypto.createHash("sha256").update(key.export({format:"der",type:"spki"})).digest("hex");
  if(actual!==item.sha256Spki)throw Error("Publisher key fingerprint mismatch");
  keys[item.keyId]=item.publicKeyPem;
 }
 return Object.freeze(keys);
}
module.exports={loadTrustedPublisherKeys};
