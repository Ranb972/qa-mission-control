# Security and privacy

QA Mission Control is a local-first portfolio application, not an authenticated
hosted service. Keep development servers bound to localhost. A public static demo
should use synthetic data and no provider credentials. Key-enabled API hosting
requires owner-managed authentication, request limits and spending controls.
The Live AI launcher binds explicitly to `127.0.0.1`. Both the ordinary Vite
server and the isolated synthetic-review server deny requests for environment
files, Git metadata and local-only data directories. Browser regressions verify
the local-data boundary using synthetic canaries.

## Reporting a vulnerability

Use the repository's **Security → Report a vulnerability** private reporting option
when enabled. If it is unavailable, contact the repository owner privately through
the contact channel on their profile. Do not post credentials, source documents,
backups or exploit payloads containing private data in a public issue.
Include the affected version, a minimal synthetic reproduction and expected impact.
There is no guaranteed response-time SLA; maintenance is currently focused on the
latest repository revision.

## Data boundaries

- Sources and QA records stay in this browser's IndexedDB until an explicit export
  or configured AI action. Browser storage and backups are plaintext.
- Original binary source files are not persisted. Reviewed text and validated
  local provenance can be included in backups; treat those files as private.
- AI credentials live only on the application server. Browser requests omit
  ambient credentials and reject redirects. Server adapters own provider headers.
- AI calls require explicit actions and send bounded context. Review source text
  for confidential material first. Raw prompts and provider envelopes are not saved.
- Local OCR sends a single page image to the application host, not an AI provider.
  It uses Windows OCR where available and has no automatic cloud fallback.
- Imported scripts are not executed. External references are not crawled or fetched.
  Credential-looking input checks are conservative, not a complete secret scanner.
- Confirmations, fingerprints and local activity are useful integrity mechanisms,
  not signed audit evidence or user-attributed compliance records.

## Dependencies and licensing

Install the committed lockfile with `npm ci`. CI checks high-severity dependency
advisories alongside product verification. A clean audit is a point-in-time
check, not a guarantee against undiscovered issues.

QA Mission Control is licensed under the [MIT License](LICENSE).
Bundled third-party notices remain applicable to their assets.
