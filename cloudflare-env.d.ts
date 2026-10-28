declare namespace Cloudflare {
 interface Env {
  DB?:D1Database;CF_ACCESS_TEAM_DOMAIN?:string;CF_ACCESS_AUD?:string;
  AUTH_SECRET?:string;TURNSTILE_SITE_KEY?:string;TURNSTILE_SECRET?:string;
  ZOHO_CLIENT_ID?:string;ZOHO_CLIENT_SECRET?:string;ZOHO_REFRESH_TOKEN?:string;ZOHO_ACCOUNT_ID?:string;
  ZOHO_FROM?:string;ZOHO_ACCOUNTS_URL?:string;ZOHO_MAIL_URL?:string;
  APP_URL?:string;
  FCM_PROJECT_ID?:string;FCM_CLIENT_EMAIL?:string;FCM_PRIVATE_KEY?:string;
  APNS_KEY_ID?:string;APNS_TEAM_ID?:string;APNS_PRIVATE_KEY?:string;APNS_BUNDLE_ID?:string;
 }
}
