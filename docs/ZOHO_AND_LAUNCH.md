# Zoho and Cloudflare launch checks

Use the existing Zoho mailbox. A new email provider or paid AI subscription is not required by this code. Actual Zoho account/API availability and sending limits depend on the mailbox plan.

## 1. Connect the mailbox securely

Sender planned in this repository: `gazeradar@wiantribe.com`.

1. In the Zoho API Console for the mailbox's own data centre, create a Self Client while signed in as the sending mailbox.
2. Generate a short-lived grant code with `ZohoMail.messages.CREATE,ZohoMail.accounts.READ`.
3. On your own computer, supply `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET` and `ZOHO_GRANT_CODE` as environment variables and run `node scripts/zoho-oauth-setup.mjs`. For a non-Canada mailbox, also set its correct `ZOHO_ACCOUNTS_URL` and `ZOHO_MAIL_URL` before running the helper. It returns the refresh token and account ID locally.
4. Add the result directly to **Cloudflare → Workers & Pages → gazeradar → Settings → Variables and Secrets**. Do not post grant codes, refresh tokens, client secrets or app passwords into chat, screenshots or GitHub.

| Name | Cloudflare type | Value |
| --- | --- | --- |
| `ZOHO_CLIENT_ID` | Secret | Zoho OAuth client ID |
| `ZOHO_CLIENT_SECRET` | Secret | Zoho OAuth client secret |
| `ZOHO_REFRESH_TOKEN` | Secret | Long-lived refresh token |
| `ZOHO_ACCOUNT_ID` | Variable | Numeric mailbox account ID |
| `ZOHO_FROM` | Variable | The sending address, associated with this Zoho account |
| `ZOHO_ACCOUNTS_URL` | Variable, optional | Canada default: `https://accounts.zohocloud.ca` |
| `ZOHO_MAIL_URL` | Variable, optional | Canada default: `https://mail.zohocloud.ca` |
| `APP_URL` | Variable, optional | `https://gazeradar.wiantribe.com` |
| `AUTH_SECRET` | Secret | A long random value used to protect sign-in codes and unsubscribe links |
| `TURNSTILE_SECRET` | Secret | Widget secret from Cloudflare Turnstile |
| `TURNSTILE_SITE_KEY` | Variable | Widget site key for the enabled GazeRadar hostname(s) |

For the US/global Zoho data centre, the endpoints are `https://accounts.zoho.com` and `https://mail.zoho.com`. Use a matching pair for the account's real region. Keep SPF/DKIM correctly configured for the sending domain in Zoho; this application does not change DNS records.

## 2. Deploy the prepared code

Keep build/deploy commands unchanged: `pnpm run build` and `pnpm run deploy`.

The last log line should read **GazeRadar Worker deployed and D1 migrations applied.** The current source adds migrations `0003_stale_mordo.sql` and `0004_gifted_slyde.sql`; preserve all earlier migrations.

Under the Worker’s triggers/scheduled events, verify the cron `*/15 * * * *`. Cloudflare runs it independently of an open browser. Existing runtime variables are preserved by `keep_vars`; secrets are not bundled in JavaScript.

## 3. Verify sign-in and actual email

1. Sign in using an email code. This verifies the recipient and exercises Zoho sending.
2. Open **Settings**. Verify that it shows your sign-in address, a configured Zoho adapter and eventually a real scheduler timestamp.
3. Save **When a change is detected** as the email frequency.
4. Add a public page you control to **Any Website**, with email included. Run the first check to establish a baseline.
5. Change a readable paragraph on that page; wait at least a minute and check again. Confirm the in-app event. Leave the page alone and allow a subsequent cron run to deliver the queued email.
6. Confirm the inbox email's text, original link and detected time. Provider acceptance alone is not proof that an inbox received it.
7. Open the unsubscribe link. It should show a confirmation page; submit it and verify **Email off** in Settings.
8. If wanted, enable daily/weekly summaries and choose whether to send a no-change summary. The first is due one period after saving.

A failed delivery keeps events pending, shows a generic mail error and retries after backoff. A failed source check preserves the old baseline and appears in monitoring status. If a listing returns 404/410, its alert must say **Listing unavailable**, never **Sold**.

## Release status

Repository tests and build verification do not establish that this account's live credentials, DNS, cron or mailbox delivery are working. Those checks require the owner's Cloudflare/Zoho configuration. No live secrets were available in the implementation workspace, and no test email was sent from it.

References: [Zoho Mail sending API](https://www.zoho.com/mail/help/api/post-send-an-email.html), [OAuth guide](https://www.zoho.com/mail/help/api/using-oauth-2.html), [Cloudflare scheduled handler](https://developers.cloudflare.com/workers/runtime-apis/handlers/scheduled/).
