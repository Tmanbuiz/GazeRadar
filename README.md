# GazeRadar

An original, private careers-page monitoring MVP inspired by changedetection.io. It does not contain or run the changedetection.io source or service.

## Available now

- ChatGPT identity and owner-scoped persistent D1 watches and events.
- Add a public HTTPS HTML/text page and optional comma-separated keyword phrases.
- Manual checks, baseline comparison, an in-app alert inbox, pause/resume, search, and deletion.
- First successful check establishes a baseline; later checks report new lines matching any keyword (case insensitive). Empty keywords match all new text. Changes are not verified job listings.
- Limits: 20 watches per account, at least 60 seconds between checks, 1 MB fetched-page limit, 18-second fetch timeout, 4 redirect attempts. Failed checks preserve the previous baseline.

## Not yet connected

Unattended checking and email delivery. The app visibly labels both as unavailable. No emails are sent and no automatic schedules are installed. JavaScript rendering, PDF parsing, authenticated external pages, integrations with job boards, and extraction of individual verified jobs are outside this version.

## Development

Use the Sites workflow with the pinned Vinext starter and existing hosting identity. Install using the plugin dependency helper. Generate schema changes with `npm run db:generate`, build with the Sites build helper, and apply local migrations as described in the starter. Do not rewrite applied migrations.

Run `node --experimental-strip-types --test tests/monitor.test.mjs` and `npx tsc --noEmit`.

The production host supplies trusted `oai-authenticated-user-id` identity headers. Do not expose the Worker directly under a host that permits spoofed identity headers. All app records are keyed by the stable user ID, not email.

## Next implementation milestone

Connect a dedicated monitoring backend (changedetection.io or a job queue with browser rendering), configure an email provider using runtime secrets, add per-watch cadence and delivery preferences, and verify a real unattended check and email before enabling either setting. Keep source authorisation and job-board access terms in scope for each integration.

## Source and hosting

Project repository: https://github.com/Tmanbuiz/GazeRadar

The existing private deployment is https://gazeradar.sandyriver7.chatgpt.site. The Sites hosting identity in `.openai/hosting.json` belongs to that existing deployment; reuse it for edits. GitHub commits do not automatically deploy to Sites. Publication still requires the Sites source-sync, build, and saved-version deployment workflow.

## Deploy to your own Cloudflare account

Cloudflare Workers Builds settings:

- Build command: `pnpm run build`
- Deploy command: `pnpm run deploy`

Wrangler 4.45+ can provision D1 when `database_id` is omitted. The Vite config declares `gazeradar-db` and the `DB` binding, without an account-specific placeholder. The deploy script publishes the Worker, then applies migrations to its provisioned database using the generated config. Future deploys reuse the linked resource. Your build token needs Worker deployment and D1 permissions. The build command alone does not create a remote database.

The first deployment may briefly serve the UI before its tables exist. If schema migration fails, the deploy command fails and reports it; rerun after fixing the migration or permissions.

**Authentication:** The existing app uses dispatch-owned ChatGPT sign-in, which only works at the Sites URL. Deploying the bundle to workers.dev does not install that dispatcher or its sign-in routes. Direct-hosted requests have identity headers stripped and stay signed out until an independent authentication integration is implemented. Do not remove that guard or add a hardcoded user identity to work around sign-in.
