# Setup and operation

## Zero-key local application

Use Node 22.13+ or Node 24+ and npm 10+. In a fresh checkout:

```sh
npm ci
npm run dev -- --host 127.0.0.1
```

Open Vite's printed URL. No environment file is required. The dashboard demo uses
synthetic data and the normal atomic workspace loader. It replaces the current
browser origin's data only after confirmation. Export existing work first.
Browser storage is origin-specific: changing host or port opens another workspace.

For a production bundle locally:

```sh
npm run build
npm run preview -- --host 127.0.0.1
```

The bundle supports the zero-key demo and manual workflow. Preview also supports
the host's optional local OCR bridge; static hosting does not provide that bridge.

## Optional local Live AI

Copy `.env.example` to `.env.local` and set your own server-side Groq key. Never
use `VITE_` credentials. `npm run env:check` reports presence, not secret values.
`npm run dev:ai` invokes the Vercel CLI through npx and may require installation,
authentication and project selection. It is not required for the demo.
The launcher explicitly binds to `127.0.0.1:3000`, keeping the key-enabled backend
off other network interfaces.
The CLI serves the app's `/api/ai/*` handlers; ordinary Vite does not.

Explicit analysis sends bounded reviewed source context to the configured provider.
Review confidential material before sending it. AI interpretations are experimental;
evidence matching does not establish semantic correctness. No live calls are
needed for lint, unit tests, builds or browser tests.

Keep development servers local. Do not expose key-enabled handlers publicly
without host authentication, request limits and spending controls. This repository
does not implement a public account or authorization service.

## Verification and troubleshooting

```sh
npm run lint
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

On Linux CI, use `npx playwright install --with-deps chromium`. Tests start their
own Vite server on 127.0.0.1:5197; free that port before running. The suite includes
storage/restore failures, execution races, large-workspace stress and local/mock AI
privacy checks. Windows can test installed local OCR; other platforms verify the
manual-transcription/unavailable path.

Use workspace backup before clearing site data. A failed storage operation should
leave earlier saved data intact; reload if an interrupted restore has an uncertain
outcome.
