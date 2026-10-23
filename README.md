# GazeRadar

An original, private careers-page monitoring MVP inspired by changedetection.io. It does not contain or run the changedetection.io source or service.

## Available now

- Cloudflare Access identity and owner-scoped persistent D1 watches and events.
- Add a public HTTPS HTML/text page and optional comma-separated keyword phrases.
- Manual checks, baseline comparison, an in-app alert inbox, pause/resume, search, and deletion.
- First successful check establishes a baseline; later checks report new lines matching the keywords (case insensitive). Empty keywords match all new text. Changes are not verified job listings.
- Keyword rules: a keyword matches a word that starts with it ("engineer" also matches "engineering"). Keywords of three characters or fewer, and keywords in "quotes", must match a whole word ("it" does not match "item"). A keyword starting with `-` excludes lines that match it ("-senior"). Lines of four characters or more are compared.
- Baselines store a short hash per line rather than the page text, so a row stays small. Baselines saved by the first version (full text) are still read and are converted on the next successful check.
- If a page no longer resembles the baseline (fewer than 40% of its lines remain, for baselines of 20+ lines), the check fails with a message and keeps the old baseline, because it is usually an error page or bot check. After 2 such problem checks in a row, and only if the last good check was at least an hour ago, the new page becomes the baseline and no alerts are created.
- Each watch shows its last successful check separately from failed attempts, and reads "Needs attention" after 3 failed checks in a row.
- An alert line shows an "Open link" when the page had a link whose text matches that line. This is only a link found next to the text on the page; it is not a verified job posting. Only https links are kept.
- Limits: 20 watches per account, at least 60 seconds between checks, 1 MB fetched-page limit, 18-second fetch timeout, 4 redirect attempts, 1,500 compared lines per page (a check reports when a page was cut off), 30 lines per alert (with a "more" count), newest 500 alerts kept per account (the inbox shows the latest 100). Failed checks preserve the previous baseline.

## Not yet connected

Unattended checking and email delivery. The app visibly labels both as unavailable. No emails are sent and no automatic schedules are installed. JavaScript rendering, PDF parsing, authenticated external pages, integrations with job boards, and extraction of individual verified jobs are outside this version.

## Development

Install with `pnpm install --frozen-lockfile`, run `pnpm run dev` locally, and build with `pnpm run build`. Generate schema changes with `pnpm run db:generate`. Do not rewrite applied migrations. Run tests with `node --experimental-strip-types --test tests/*.test.mjs` and `npx tsc --noEmit`.

## Next implementation milestone

Connect a dedicated monitoring backend (changedetection.io or a job queue with browser rendering), configure an email provider using runtime secrets, add per-watch cadence and delivery preferences, and verify a real unattended check and email before enabling either setting. Keep source authorisation and job-board access terms in scope for each integration.

## Hosting — your Cloudflare account only

Source: https://github.com/Tmanbuiz/GazeRadar

Live address: https://gazeradar.wiantribe.com (custom domain on the `gazeradar` Worker, declared in `wrangler.json` under `routes`; the `wiantribe.com` zone must stay in the same Cloudflare account). The default `https://gazeradar.atoyejet.workers.dev` address also reaches the same Worker. Cover every address you leave enabled with the Access application, or turn the workers.dev address off in the Worker's Domains settings.

The previous ChatGPT-hosted Site was deleted at the owner's request. Do not publish this project through ChatGPT Sites or reintroduce its hosting configuration, connector services, identity headers or sign-in links.

Cloudflare Workers Builds settings:

- Build command: `pnpm run build`
- Deploy command: `pnpm run deploy`

`wrangler.json` declares the Worker and D1 binding. Wrangler provisions or reuses the linked database. The deployment script resolves the DB binding from the deployed Worker settings if needed, then applies the migrations. The build token needs Worker and D1 permissions. Tokens must remain in Cloudflare build settings.

## Account sign-in with Cloudflare Access

1. Protect the Worker hostname with a Cloudflare Access application in your own account. Configure an allow policy for the people who should use it.
2. In the Worker runtime variables, set `CF_ACCESS_TEAM_DOMAIN` to your team hostname, for example `my-team.cloudflareaccess.com` (no `https://`), and `CF_ACCESS_AUD` to the application's audience tag. These are configuration identifiers, not passwords. `keep_vars` preserves dashboard variables on deployment.
3. Sign in through Access. The app verifies the token's RSA signature, issuer, application audience, expiry and subject against your team's public signing keys. It never trusts client-supplied user-ID headers.

Until Access is configured, the UI remains a preview and private record operations reject unauthenticated requests. Authentication is not configured or verified in the user's Cloudflare account from this environment. Existing records keyed under an earlier identity are not silently reassigned.

Reference: https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/
