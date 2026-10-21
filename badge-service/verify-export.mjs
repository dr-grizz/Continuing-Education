import { createPublicKey, verify } from 'node:crypto';
import { readFileSync } from 'node:fs';

// The key file must come from a trusted issuer channel, not the credential itself.
if (process.argv.length !== 4) {
  console.error('Usage: node verify-export.mjs credential.json trusted-jwks.json');
  process.exit(2);
}
const envelope = JSON.parse(readFileSync(process.argv[2]));
const jwks = JSON.parse(readFileSync(process.argv[3]));
const jwk = jwks.keys.find(key => key.kid === envelope.kid);
if (!jwk || envelope.algorithm !== 'Ed25519' || envelope.format !== 'cu-pilot-signed-envelope-v1') {
  console.error('Unknown signing key or export format'); process.exit(1);
}
const valid = verify(null,Buffer.from(envelope.payload,'base64url'),createPublicKey({key:jwk,format:'jwk'}),Buffer.from(envelope.signature,'base64url'));
console.log(valid ? 'Signature verified. Current revocation status must be checked with the issuer.' : 'INVALID SIGNATURE');
process.exitCode = valid ? 0 : 1;
