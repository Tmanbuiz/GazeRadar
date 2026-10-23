// Run this yourself, on your own computer. It turns a one-time Zoho "grant code" into a refresh token and finds
// your mail account id. Nothing is saved or uploaded: copy the printed values into Cloudflare Worker secrets.
//
//   ZOHO_CLIENT_ID=... ZOHO_CLIENT_SECRET=... ZOHO_GRANT_CODE=... node scripts/zoho-oauth-setup.mjs
//
// Canada data centre by default. For another region set ZOHO_ACCOUNTS_URL and ZOHO_MAIL_URL (see README).
const accounts = process.env.ZOHO_ACCOUNTS_URL || 'https://accounts.zohocloud.ca';
const mail = process.env.ZOHO_MAIL_URL || 'https://mail.zohocloud.ca';
const {ZOHO_CLIENT_ID: id, ZOHO_CLIENT_SECRET: secret, ZOHO_GRANT_CODE: code} = process.env;
if (!id || !secret || !code) { console.error('Set ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET and ZOHO_GRANT_CODE first.'); process.exit(1); }

const tokenRes = await fetch(`${accounts}/oauth/v2/token`, {
 method: 'POST', headers: {'content-type': 'application/x-www-form-urlencoded'},
 body: new URLSearchParams({grant_type: 'authorization_code', client_id: id, client_secret: secret, code}).toString(),
});
const tok = await tokenRes.json().catch(() => ({}));
if (!tok.refresh_token) { console.error('Zoho did not return a refresh token:', tok.error || tokenRes.status, '\nGrant codes expire in a few minutes and work once. Generate a new one.'); process.exit(1); }

const acctRes = await fetch(`${mail}/api/accounts`, {headers: {authorization: `Zoho-oauthtoken ${tok.access_token}`}});
const acct = await acctRes.json().catch(() => ({}));
const list = Array.isArray(acct.data) ? acct.data : [];
console.log('\nSet these as Worker secrets/variables in Cloudflare:\n');
console.log('ZOHO_REFRESH_TOKEN =', tok.refresh_token);
for (const a of list) console.log(`ZOHO_ACCOUNT_ID    = ${a.accountId}   (${a.primaryEmailAddress || a.emailAddress || 'mailbox'})`);
if (!list.length) console.log('Could not list accounts (needs the ZohoMail.accounts.READ scope). Find the account id in Zoho Mail settings.');
