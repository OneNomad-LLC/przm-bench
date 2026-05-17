# Workflows runbook

## bench.yml â€” Run Â· Sign Â· Publish

Produces a signed receipt and opens a PR to commit it.

**Triggers**

| Trigger | When |
|---|---|
| `workflow_dispatch` | Manual from the Actions tab or `gh workflow run bench.yml` |
| `schedule` | Nightly at 03:00 UTC |
| `repository_dispatch` type `competitor-release` | Webhook from an external release monitor |

**Manual run**

```bash
gh workflow run bench.yml \
  -f adapter=engram \
  -f fixture=longmemeval-temporal-inference-v1
```

**Inputs**

| Name | Default | Description |
|---|---|---|
| `adapter` | `engram` | Adapter slug (engram, mem0, letta, zep, mempalace, hipporag) |
| `fixture` | `longmemeval-temporal-inference-v1` | Fixture filename without `.json` extension |

**Secrets required**

| Secret | Where to set | Notes |
|---|---|---|
| `RECEIPT_SIGNING_PRIVATE_KEY` | Repo Settings > Secrets > Actions | PEM-encoded Ed25519 private key. Never logged. See key rotation below. |

**What it does**

1. Checks out the repo with full history so `git.commit` is accurate.
2. Builds the harness (`npm ci && npm run build`).
3. Runs the benchmark, writing an unsigned receipt to `tmp/receipt.json`.
4. Calls `scripts/sign-receipt.ts`, which imports `src/receipt/sign.ts` and writes `tmp/receipt-signed.json`.
5. Verifies the signature via `npm run verify` before committing.
6. Appends a summary row to `web/data/receipts.json` via `scripts/update-receipts-index.ts`.
7. Opens a PR on branch `receipts/<receipt-id>` using `peter-evans/create-pull-request@v6`.
8. Comments the score table on the PR.

**Permissions**

`contents: write`, `pull-requests: write` on the bench job only. All other jobs are `contents: read`.

---

## verify-pr.yml â€” Signature + SHA + Environment checks

Runs on every PR that touches `results/published/` or `web/data/receipts.json`.

**Checks**

1. Signature verification via `npm run verify` against `keys/receipt-signing.pub`.
2. Fixture SHA-256: the `fixture.sha256` in the receipt must match the actual fixture file (skips with a warning if the fixture isn't present yet â€” expected while other tracks are in flight).
3. Git commit cross-reference: the receipt's `environment.git.commit` is compared against the PR merge base. Currently a warning for v0; tighten to hard fail after confirming the bench workflow always runs from main.

**Blocks merge on**: signature failure, SHA mismatch (when fixture file is present).

---

## deploy-web.yml â€” Web build sanity check

Runs on push to `main` when `web/**` or `results/published/**` change.

Vercel's GitHub integration handles the actual deploy. This workflow is purely a local build gate â€” `cd web && npm ci && npm run build` â€” so a broken web build is caught before Vercel queues it.

**No secrets required.** Vercel's integration is configured separately in the Vercel dashboard (connect repo, set `main` as production branch).

---

## Key rotation procedure

When the Ed25519 signing key needs to be rotated:

1. Generate a new keypair:
   ```bash
   openssl genpkey -algorithm ed25519 -out new-private.pem
   openssl pkey -in new-private.pem -pubout -out keys/receipt-signing.pub
   ```
2. Update the `RECEIPT_SIGNING_PRIVATE_KEY` secret in repo settings to the new private key.
3. Commit the new `keys/receipt-signing.pub`.
4. Tag the cutover commit so old receipts (signed with the old key) can still be verified by checking out the public key at the relevant tag.
5. Document the cutover in `keys/ROTATION.md` (create if it doesn't exist).

Receipts signed before the rotation remain valid against the old public key. Receipts signed after are valid against the new key. Never overwrite a published receipt.

---

## Triggering via repository_dispatch (competitor release webhook)

```bash
gh api repos/OneNomad-LLC/przm-bench/dispatches \
  --method POST \
  --field event_type=competitor-release \
  --field client_payload[adapter]=mem0 \
  --field client_payload[fixture]=longmemeval-temporal-inference-v1
```

Requires a PAT with `repo` scope or a GitHub App with `contents: write`.
