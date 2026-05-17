# Receipt Signing Key Instructions

## Key locations

| File | Location | Committed? |
|------|----------|------------|
| Public key | `keys/receipt-signing.pub` | Yes — required |
| Private key | Anywhere on your machine that is not inside this repo | No — never |

## Generating a keypair

Run these two commands on your local machine. The private key file must stay outside the repository directory.

```sh
openssl genpkey -algorithm ed25519 -out ~/receipt-signing.key
openssl pkey -in ~/receipt-signing.key -pubout -out keys/receipt-signing.pub
```

Then commit only the public key:

```sh
git add keys/receipt-signing.pub
git commit -m "chore: add receipt signing public key"
```

Upload the private key to GitHub Actions:

1. Go to your repository on GitHub.
2. Settings → Secrets and variables → Actions → New repository secret.
3. Name: `RECEIPT_SIGNING_PRIVATE_KEY`
4. Value: paste the full contents of `~/receipt-signing.key` (including the `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----` lines).
5. Save. Delete or shred `~/receipt-signing.key` from your machine once it is in GitHub.

## Rotation procedure

1. Generate a new keypair using the same commands above (use a different output path to avoid overwriting the old private key before you are ready).
2. Commit the new public key to `keys/receipt-signing.pub`. Note the commit SHA — this is the cutover point. All receipts signed after this commit use the new key.
3. Update the `RECEIPT_SIGNING_PRIVATE_KEY` GitHub Actions secret with the new private key.
4. Shred the old private key file if it still exists on your machine.
5. Document the cutover in `CHANGELOG.md`: old fingerprint, new fingerprint, cutover commit SHA.

Receipts signed before the cutover commit remain verifiable using the old public key. To verify a pre-rotation receipt, supply the historical public key directly to `verifyReceipt`.

## Verifying the fingerprint

To confirm the public key in the repo matches the secret in GitHub Actions, run a signed benchmark and check that `signature.publicKeyFingerprint` in the resulting receipt matches:

```sh
openssl pkey -in keys/receipt-signing.pub -pubin -text -noout
```

The SHA-256 fingerprint in the receipt uses `sha256:<hex-of-DER-encoded-SPKI>` format.
