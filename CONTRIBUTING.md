# Contributing

Start with the [zero-key setup](docs/setup.md) and [architecture](docs/architecture.md).
Keep changes focused and preserve the rule: **AI suggests. QA approves.**

Use synthetic fixtures. Never add provider keys, original specifications, private
source excerpts, raw prompts/responses, local paths or browser backups. Keep Live
AI optional. Evidence, approval, stale-state handling and atomic storage are trust
boundaries; changes to them need meaningful regression coverage.

Run `npm run lint`, `npm test`, `npm run build` and `npm run test:e2e` before proposing
a release change. Product tests include storage/restore, large-document accounting,
privacy and execution integrity. Browser tests use local/mock responses and no
provider keys.

For UX changes, inspect populated desktop and mobile states as well as automated
assertions. Describe the problem, behavior change and verification in your PR.
Do not infer that a passing schema or matched quote proves semantic correctness.

The application license is pending. Agree on contribution terms with the owner
before submitting substantial contributions. Vendor licenses remain preserved.
