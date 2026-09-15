# Performance and reproduction

The deterministic scale test uses the real document pipeline and IndexedDB with
10,000 requirements, 3,000 Test Cases, 30,000 requirement-to-test links, 10,000
coverage links and 250 source regions. It makes no provider calls.

## Representative local measurement

A Chromium run on September 15, 2026, with two browser workers measured a
44,184,670-byte package: export 1,267 ms, validation 775 ms and atomic restore
103,499 ms. Record counts were preserved. During transfer, the main-thread
heartbeat continued 2,125 times; its maximum interval was 89 ms and the longest
main-thread task was 72 ms. Fixture persistence took 60,404 ms.

The four measured screens had no horizontal overflow and at most 828 DOM nodes.
Source preparation took 5.12 seconds. These are local observations, not latency
guarantees. Hardware, storage and concurrent load affect results; allow around
two minutes for a restore of this size.

## What keeps the workspace usable

Test Case, execution and report lists use bounded 40-row pages. Execution lookup
is indexed. Full report data remains available in Markdown; printed previews
identify their paging limits. Backup validation, export and atomic restore run
in a worker with visible progress. Restore cannot be canceled once its atomic
write begins; reload before retrying after an uncertain interruption.

The scale regression checks fewer than 2,500 DOM elements per measured screen,
searches the last requirement/test and traverses page boundaries. Separate tests
cover 500-page PDF ingestion and a resumable 1,500-region / 9,000-requirement job.
These establish bounded accounting and storage behavior, not OCR accuracy,
provider latency or unlimited capacity.

## Reproduce

```sh
npm ci
npx playwright install chromium
npm run test:e2e -- e2e/enterprise-performance.spec.ts
```

Run `npm run test:e2e` for the complete browser suite. The performance test reports
counts, durations and screen identifiers, without source text or raw AI payloads.
