# Changelog

All notable changes to `@onenomad/bench` are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Semver.

## [Unreleased]

### Added

- Initial repo scaffold (TypeScript, Node 22, Apache 2.0)
- Receipt schema design (Ed25519 signed JSON)
- Adapter contract (vendor-neutral, mirrored from EvoBench)
- README + METHODOLOGY skeletons
- Next.js frontend skeleton for bench.onenomad.dev
- GitHub Actions workflow skeleton (run + sign + commit + deploy)

### Notes

- v0 target: one publicly-verifiable signed receipt at
  `bench.onenomad.dev/receipts/<id>` for Engram vs Mem0 on the
  LongMemEval temporal-inference subset.
- Private signing key never enters the repo or any agent context. It
  lives only in the `RECEIPT_SIGNING_PRIVATE_KEY` GitHub secret, set by
  Matt directly via the GitHub web UI.
