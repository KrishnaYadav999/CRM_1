const crypto = require('crypto');

function base64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=+$/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

const secret = 'supersecretkey'; // from backend/.env
const args = process.argv.slice(2);
const sub = args[0] || '64b8f1c2a1e2f3d4c5b6a7e8';
const role = args[1] || 'admin';
const email = args[2] || 'it_admin@ananttattva.com';
const sid = args[3] || crypto.randomUUID();

const header = { alg: 'HS256', typ: 'JWT' };
const iat = Math.floor(Date.now() / 1000);
const exp = iat + 7 * 24 * 60 * 60; // 7 days
const payload = { sub, role, email, sid, iat, exp };

const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
const signature = crypto.createHmac('sha256', secret).update(signingInput).digest('base64')
  .replace(/=+$/g, '')
  .replace(/\+/g, '-')
  .replace(/\//g, '_');

console.log(signingInput + '.' + signature);
console.log('\n# Payload used:');
console.log(JSON.stringify(payload, null, 2));
