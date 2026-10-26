# GazeRadar

A personal opportunity desk for **Jobs, Housing and Any Website**. Source lives in [Tmanbuiz/GazeRadar](https://github.com/Tmanbuiz/GazeRadar); the application runs only in the owner's Cloudflare account.

## Current implementation

### Jobs

- Choose a PDF, DOCX or TXT CV, or enter skills and preferred job titles manually. PDF and Word text extraction runs in the browser; the original file and full text are never sent to GazeRadar. Only the editable fields explicitly saved by the user reach D1.
- Review suggested skills/titles, preferred locations, work arrangement, employment type and minimum annual CAD salary. The skill vocabulary is intentionally limited and users can correct or supplement it. There is no paid AI dependency, CV tailoring, cover-letter generation or automatic application submission.
- Add an employer's public Greenhouse or Lever **board** URL, or a readable careers/detail page. Official board read endpoints return individual jobs; HTML pages with `JobPosting` JSON-LD also produce jobs. Ordinary pages produce text-change alerts rather than invented job records.
- Matches explain title/skill overlap, location, pay information and items to review. They use Strong match / Possible match / Stretch role rather than a fabricated percentage. Missing information is stated explicitly; qualifications and eligibility are never guaranteed.
- Save, dismiss or mark jobs applied. These choices follow the listing URL across sources in the same account, including sources added later. Application links open the original source. A small source guide links to Job Bank and New Brunswick careers; these are browsing links, not inventory-feed integrations.

### Housing

- Save rent/buy preferences, locations, user-chosen CAD budget, minimum bedrooms and property type.
- Add a specific house listing or public search page to the watchlist. Readable `RealEstateListing`, `House`, `Apartment` and related JSON-LD can produce property results. Price and status comparisons require explicit published data; ordinary pages yield text-change alerts.
- Choose price, published status, description, open-house or photo-link changes. Photo comparisons concern links, not image downloads. Price comparisons require two known prices in the same currency. An existing tracked home's changes remain reportable even if its new price exceeds the search budget.
- A 404/410 after a successful check creates one **Listing unavailable** alert, preserving the old baseline; it never claims that the home sold. A listing absent from complete source data is labelled absent from that source, not confirmed sold. Failure to extract details is a failed check, not a zero price or removal.
- With status alerts enabled, a retained property returning after an absence from complete source data creates one source-return alert, even if its details are unchanged. The alert asks users to verify current availability; reappearance alone does not establish that it is back on the market. Partial source data never establishes an absence.
- REALTOR.ca and Zillow links in the source guide do not imply partnership, authorised inventory access or guaranteed monitoring. A source that blocks access remains unsupported until a permitted integration is available; there is no bot-check bypass.

### Any Website and shared watchlist

- Monitor a public HTTPS HTML/text page with optional comma-separated keyword phrases. Keywords match word starts; short terms (3 characters or fewer) and quoted terms match whole words. A leading `-` excludes a phrase.
- The first ordinary-page check stores hashed lines as a baseline. Later checks report matching additions. Jobs without explicit keywords use the saved job titles/skills. All page-text alerts are leads to inspect, not verified listings.
- Large unexpected page changes preserve the baseline first. After two failures and an hour since the last good check, an ordinary page may be rebased without generating alerts. Previously structured sources must remain readable as structured data; bot/error pages cannot silently replace those details.
- Add/edit preferences, pause/resume, search, manual checks, owner-scoped inbox and deletion confirmation.

## Scheduled checks and Zoho email

The Worker exports a `scheduled` handler and `wrangler.json` installs `*/15 * * * *` in **Cloudflare**, with no ChatGPT automation or hosted component.

- Per-watch targets: 1, 6 (default), 12 or 24 hours, or weekly. Each run takes the 3 oldest due watches, then up to 3 eligible email accounts. This conservative first-release budget can delay checks under load; intervals are targets, not delivery guarantees. Raise batch sizes only after checking the owner's plan/usage.
- Check leases prevent concurrent duplicate checks. Failed checks keep the previous baseline, display a recovery message and back off (up to a week).
- Email defaults **off**. Users explicitly choose change emails, a daily summary or a weekly summary, optionally receiving a no-change summary. Per-watch email can be disabled independently. Enabling email starts with future changes; turning it off retires pending emails.
- Only an address verified through the email-code sign-in can receive alerts. Cloudflare Access-only users need email verification before enabling delivery. Arbitrary recipient addresses are not accepted.
- Email uses the same Zoho Mail OAuth adapter as sign-in, with cached access tokens, one refresh/retry on 401, allowed Zoho hosts only, no credential-bearing redirects, timeouts and provider errors. Secrets stay server-side.
- Emails include detected times, source links, monitoring failures and a signed unsubscribe link. Opening unsubscribe is a confirmation page; only submitting it changes preferences. Daily/weekly emails begin one period after saving. Up to 30 source events fit in an email; additional pending events continue in later batches.
- Pending event IDs are retired only after provider acceptance. Failed sends retry with backoff. A provider accepting a message immediately before an infrastructure/database failure can still lead to a duplicate retry; this is not an exactly-once mail system. Provider acceptance is not proof of inbox delivery.
- Limits: 200 alert-send attempts/day and 300 total email attempts/day shared with sign-in; Zoho account limits also apply. These are protective app caps, not a claim that a free account can deliver that many messages.
- Settings show the last real scheduler run and last accepted alert email. Missing credentials are shown as pending setup. The implementation has not configured or verified the owner's live Zoho credentials from this workspace.

## Limits and source access

20 watches/account; at least 60 seconds between manual checks; 18-second source timeout; 4 redirect attempts; HTML response up to 1 MB and 1,500 lines; provider JSON up to 4 MB, first 100 jobs (no pagination); structured data capped at 100 records/source; 200 automatically retained discoveries/watch, plus items explicitly saved, applied or dismissed; 30 displayed lines/change alert; inbox shows latest 100 events and retains the newest 500 plus undelivered events. New discoveries are processed before older automatic history is trimmed, so filling the history does not stop future matches. Current source items take priority over absent history. An older, unsaved item outside that history may be treated as a new discovery if encountered again. A truncated source never proves an old listing is absent. Legacy baselines remain readable.

CVs: up to 5 MB, PDFs up to 20 pages, text PDFs only. Scanned/image PDFs need manual entry; encrypted or malformed documents can fail. CV text is temporary browser memory. Saved job/housing profiles can be replaced/deleted. Deleting a watch also deletes its discovered items and alerts.

Sources requiring JavaScript rendering, authenticated sessions, OCR, broader job/property feeds and partnership integrations remain future work. Do not assume access to Indeed, Google, CREA/DDF or Zillow inventory. Use permitted source-specific integrations and attribution before expanding coverage.

## Development and validation

```sh
pnpm install --frozen-lockfile
pnpm run dev
pnpm run build
pnpm exec tsc --noEmit
node --experimental-strip-types --test tests/*.test.mjs
```

New schema changes use `pnpm run db:generate`; preserve previously applied migrations. Tests run real migration SQL in `node:sqlite` and cover authentication, source bounds, matching, baselines, leases, property price/removal alerts, mail scheduling, retries, isolation and unsubscribe. For local D1, run:

```sh
pnpm exec wrangler d1 migrations apply DB --local --config wrangler.json --persist-to .wrangler/state
```

The production deployment script resolves source migrations to an absolute path; generated configuration lives in `dist/server`, not alongside the source `drizzle` folder.

## Hosting — owner's Cloudflare account only

Live hostname: https://gazeradar.wiantribe.com. The default https://gazeradar.atoyejet.workers.dev address reaches the same Worker when enabled. `wiantribe.com` must remain in the same Cloudflare account as the Worker.

Do not create, publish, update or mirror this application using ChatGPT Sites or ChatGPT-hosted runtimes. The previous Site was deleted at the owner's request. Do not reintroduce ChatGPT hosting configuration, connectors, identity headers or sign-in links.

Cloudflare Workers Builds:

- Build: `pnpm run build`
- Deploy: `pnpm run deploy`

Wrangler provisions/reuses D1. The deploy script resolves inherited binding IDs, then applies migrations from the source directory. The build token needs appropriate Worker/D1 permissions and stays in Cloudflare settings. `keep_vars` preserves runtime variables set in the dashboard. Verify migrations complete and the `*/15 * * * *` trigger appears after deployment.

## Zoho setup (reuse the existing mailbox)

The planned sender is **gazeradar@wiantribe.com**. The default endpoints are Zoho's Canada data centre; choose the endpoints belonging to the **mailbox's actual data centre**, not the recipient's country. See [Zoho setup and launch checks](docs/ZOHO_AND_LAUNCH.md).

Worker secrets: `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, `ZOHO_REFRESH_TOKEN`, `AUTH_SECRET`, `TURNSTILE_SECRET`.

Worker ordinary variables: `ZOHO_ACCOUNT_ID`, `ZOHO_FROM`, `TURNSTILE_SITE_KEY`. Optional: `ZOHO_ACCOUNTS_URL`, `ZOHO_MAIL_URL`, `APP_URL` (default `https://gazeradar.wiantribe.com`). Never commit secrets or put them into client code.

## Account authentication

Email-code sign-in creates a private account on the first successful verification. Codes are random, HMAC-stored, single-use, valid 10 minutes, with 5 wrong attempts maximum. Sessions use a random token in a 30-day `__Host-gz_session` cookie (HttpOnly, Secure, SameSite=Lax); only its hash is stored. State-changing requests require the site's own origin. Turnstile and per-address/IP/global limits protect code requests.

Optional Cloudflare Access support verifies signed JWTs using `CF_ACCESS_TEAM_DOMAIN` and `CF_ACCESS_AUD`. Protect every enabled hostname consistently. Access subjects and email-code subjects remain separate identities; old records are never silently reassigned. Client-supplied user-ID headers and hardcoded shared identities are never trusted.
