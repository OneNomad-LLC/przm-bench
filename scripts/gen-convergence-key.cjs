/**
 * One-time keypair generator for the convergence preview signing key.
 *
 * Run once with no args. Writes:
 *   - keys/convergence-preview.pub  (PEM, committed to repo)
 *   - <tmp>/convergence-preview.private.pem  (printed path on stdout)
 *
 * The private key file is meant to be imported into Windows Credential
 * Manager and then deleted from disk. The script does NOT print the
 * private key to stdout; only the temp file path.
 */
const { generateKeyPairSync } = require('node:crypto');
const { writeFileSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');

const { publicKey, privateKey } = generateKeyPairSync('ed25519');

const pubPath = join(__dirname, '..', 'keys', 'convergence-preview.pub');
const pubPem = publicKey.export({ type: 'spki', format: 'pem' });
writeFileSync(pubPath, pubPem, 'utf8');

const privPath = join(tmpdir(), `convergence-preview-${process.pid}.private.pem`);
const privPem = privateKey.export({ type: 'pkcs8', format: 'pem' });
writeFileSync(privPath, privPem, { encoding: 'utf8', mode: 0o600 });

console.log(JSON.stringify({
  publicKeyPath: pubPath,
  privateKeyTempPath: privPath,
  publicKeyFirstLine: pubPem.split('\n')[1],
}, null, 2));
