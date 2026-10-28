# Applications from users’ own email

GazeRadar supports delegated Gmail and Microsoft Outlook/365 sending. This does not use the site's Zoho sender or a ChatGPT connector. Employers must accept email applications; GazeRadar does not bypass their ATS forms.

## Cloudflare configuration

Set these on the production Worker and redeploy. Keep all secrets out of Git, chat and build logs.

| Variable | Type | Purpose |
| --- | --- | --- |
| APP_URL | Text | `https://gazeradar.wiantribe.com` |
| MAIL_TOKEN_KEY | Secret | A separate random key of at least 32 characters, e.g. locally generated with `openssl rand -base64 32`. Keep a backup; replacing it requires reconnecting every mailbox. |
| GOOGLE_MAIL_CLIENT_ID | Text or secret | Google web application client ID |
| GOOGLE_MAIL_CLIENT_SECRET | Secret | Corresponding Google client secret |
| MICROSOFT_MAIL_CLIENT_ID | Text or secret | Microsoft Entra application ID |
| MICROSOFT_MAIL_CLIENT_SECRET | Secret | Corresponding client secret **value**, not its identifier |

Each provider stays disabled until its two credentials, APP_URL and MAIL_TOKEN_KEY are present. One provider may be enabled independently.

## Google

Create an OAuth **Web application** client in an owner-controlled Google Cloud project. Enable Gmail API and configure OAuth branding/audience, the site's domain, and the factual privacy page at `https://gazeradar.wiantribe.com/privacy`.

Authorized redirect URI (exact):
`https://gazeradar.wiantribe.com/api/mail/callback`

Requested scopes: `openid`, `email`, `https://www.googleapis.com/auth/gmail.send`.
The application requests offline access and explicit consent. It does not request inbox-reading scopes. Use test users while the OAuth app is in Testing. Google may require verification before general availability; testing refresh tokens can expire. Do not represent development/test-user access as a public production launch.

## Microsoft

Create an owner-controlled Microsoft Entra app supporting organizational directories **and personal Microsoft accounts**. Add the same callback above under **Web**. Use **delegated**, not application, permissions: `User.Read`, `Mail.Send`, plus `openid email profile offline_access`. Organizational tenant consent policies can block a user's connection even if personal-account tests pass.

## User flow

Jobs → Connect Gmail/Outlook → provider consent → Jobs. The provider verifies the account address. The connected address is the sender; a client-supplied From address cannot override it. Mailbox connection is distinct from signing in to GazeRadar.

Native pilot users must connect their mailbox through the website in Safari/Chrome, signed in to the same GazeRadar account, then return to the app. Embedded WebView OAuth is not supported. The app refreshes account metadata when it resumes.

Compose a draft, select a PDF/DOCX/TXT CV (up to 2 MiB for sending), enter one employer address from the original listing, and choose Review application. Review shows the exact sender, recipient, subject, body and CV filename. Only the explicit Send application action submits it. No automatic application or background send is scheduled.

History records provider acceptance, not employer delivery, receipt or hiring outcome. Incomplete/uncertain attempts require checking the user's Sent folder before another attempt. Sending is attempted once, with no automatic provider retry. Duplicate request IDs and rapid same-recipient/title submissions are blocked. Limits are five attempts per owner and 100 total per rolling day.

## Storage and security

Migration `0006_own_email_applications` adds mailbox connections, short-lived OAuth states and application metadata. Refresh tokens and PKCE verifiers use AES-GCM, with owner-bound additional authenticated data. OAuth uses random one-time state, a secure HttpOnly SameSite=Lax cookie, authenticated owner binding, PKCE, a ten-minute expiry, and one-time state consumption. All provider endpoints are fixed, HTTPS, redirect-disabled, and time-bounded.

CV bytes and message content are processed in memory for the send and are not saved in D1 or application logs. Gmail/Outlook and the employer retain their own message/attachment copies. D1 history contains only the sender, recipient, job title/link, time and delivery status. Disconnect removes the saved refresh token and pending OAuth state; it does not erase prior applications or revoke the provider grant. Users can additionally revoke GazeRadar in Google/Microsoft account permissions.

## Required live validation

Automated tests cover input bounds, privacy, encryption owner isolation, MIME/Graph payloads, quota/idempotency, and single-attempt failure behavior. No employer applications were sent during development. After configuring a provider, the owner must explicitly connect a test mailbox and confirm a reviewed test application to an address they control. Verify its sender, UTF-8 text, attachment, Sent copy, replies and duplicate behavior. Repeat for both providers and a physical native device before claiming full rollout.
