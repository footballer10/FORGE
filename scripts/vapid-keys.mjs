// Generates the VAPID key pair for lock-screen rest alerts (milestone 17).
// Usage: node scripts/vapid-keys.mjs   then run the two printed commands inside worker/.
const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const b64u = (bytes) => Buffer.from(bytes).toString('base64url');
const publicKey = b64u(new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey)));
const privateKey = (await crypto.subtle.exportKey('jwk', pair.privateKey)).d;
console.log('Run these in worker/ (paste each value when asked):\n');
console.log('  npx wrangler secret put VAPID_PUBLIC');
console.log(`    ${publicKey}\n`);
console.log('  npx wrangler secret put VAPID_PRIVATE');
console.log(`    ${privateKey}\n`);
console.log('Keep the private value out of the repo and out of chat. Run this script again only if you want to replace the keys (every phone must then turn the alerts off and on once).');
