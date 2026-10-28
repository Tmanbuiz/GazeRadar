# GazeRadar Android and iPhone apps

App identifier on both platforms: `com.wiantribe.gazeradar`.

The native projects are in `mobile/android` and `mobile/ios`. They use Capacitor 8
and load the owner's Cloudflare-hosted workspace over HTTPS. No ChatGPT hosting,
shared login identity, or alternate backend is introduced. Sessions remain in each
app's web view; sign in separately on each device.

These are pilot/test builds. They currently load the live workspace using
Capacitor's remote `server.url` option, which its documentation designates for
live-reload rather than production. Before store submission, package the app UI
locally with a dedicated authenticated API client and complete device/store QA.
Do not describe the generated unsigned IPA or debug APK as store-ready releases.

## Background monitoring and notification behavior

Cloudflare keeps checking watches even if the phone is offline, the app is closed,
or its process is suspended. The scheduler runs every 15 minutes and handles a
bounded batch; watch intervals and queues determine actual detection time. Phone
background timers are not used to scrape sites or keep the process alive.

Visible push alerts use FCM on Android and APNs on iPhone. They do not need the
app to remain running. Delivery is best effort: permission denial, Focus/Do Not
Disturb, device restrictions, connectivity and force-stop can delay or suppress
notifications. No critical/safety delivery guarantee is made.

Users explicitly enable alerts in Settings > Device alerts. Registering a device
starts with future events, not the existing backlog. Up to five devices per
account are supported. Generic lock-screen messages omit listing titles,
addresses, and email. Tapping opens Alert inbox. Foreground/resume refreshes data.
Sign-out removes this device's server registration and unregisters native push.
Registered devices can also be removed from Settings on the web. Removed devices
are not silently re-enabled by automatic registration refresh.

Push is independent of email frequency. A user's enabled device receives new
change events for their active watches. Failed push attempts back off; invalid
provider tokens disable the registration. Cursor updates happen after provider
acceptance. A crash after acceptance can result in a duplicate generic alert;
provider acceptance does not prove delivery or that a person saw the alert.

## Build outputs

The `GazeRadar mobile builds` GitHub Actions workflow runs when mobile files
change, or manually from Actions. It produces:

- `GazeRadar-Android-debug`: installable debug APK, signed with the runner's debug
  key. Future debug builds may require uninstalling the previous build because
  runner debug keys can differ. Use a securely retained signing key for release.
- `GazeRadar-iPhone-unsigned`: unsigned IPA compiled for physical iPhones/iPads.
  It must be signed with a valid Apple profile before installation. Unsigned
  packages cannot receive APNs or be uploaded directly to TestFlight.

Build artifacts expire after seven days. Builds do not publish an app, submit to
stores, create developer accounts, or activate push services automatically.

Local setup: Node 22+, `pnpm install --frozen-lockfile`, `pnpm exec cap sync`.
Android requires Android Studio/SDK 36 and Java 21; build with
`cd mobile/android && ./gradlew assembleDebug`.
iPhone compilation/signing requires macOS and current Xcode. Open
`mobile/ios/App/App.xcodeproj`, select your Apple team, and enable Push
Notifications for this explicit App ID. Release uses production APNs;
development signing uses sandbox. For a sandbox test, set the native config
server URL to `https://gazeradar.wiantribe.com/?pushEnvironment=sandbox` and sync
before building. Do not use sandbox for TestFlight.

## Android notification configuration

1. Register Android app `com.wiantribe.gazeradar` in a Firebase project.
2. Put its `google-services.json` into `mobile/android/app/` locally. For CI,
   save its exact JSON in the repository Actions secret `GOOGLE_SERVICES_JSON`.
   It is intentionally excluded from source control.
3. Enable FCM HTTP v1. Use a dedicated Firebase service account with permission
   to send messages for that project.
4. In Cloudflare Worker variables/secrets set:
   - `FCM_PROJECT_ID`: Firebase project ID (text).
   - `FCM_CLIENT_EMAIL`: service account email (secret).
   - `FCM_PRIVATE_KEY`: service account PKCS8 PEM private key (secret).
5. Rebuild/reinstall the Android app, sign in, and enable device alerts. Android
   13+ asks for notification permission. The plugin supplies its manifest entries.

Without google-services.json the APK can open the workspace but Firebase push
registration is unavailable. Backend configuration status alone does not prove
native Firebase initialization or actual notification receipt.

## Apple notification configuration

1. Register explicit App ID `com.wiantribe.gazeradar` in your Apple developer
   account with Push Notifications enabled. Generate appropriate signing and
   provisioning profiles with that entitlement.
2. Create an APNs token signing key. Keep its .p8 private key out of the app,
   repository, and chat.
3. In Cloudflare Worker variables/secrets set:
   - `APNS_KEY_ID`: signing key ID (secret).
   - `APNS_TEAM_ID`: Apple team ID (secret).
   - `APNS_PRIVATE_KEY`: full PKCS8 PEM .p8 contents (secret).
   - `APNS_BUNDLE_ID`: `com.wiantribe.gazeradar` (text).
4. Sign/archive on macOS using your team. TestFlight requires an App Store
   distribution build and App Store Connect setup; the unsigned CI IPA is not
   a TestFlight upload.
5. On a physical iPhone, sign in and explicitly allow notifications.

## Deployment and verification

`pnpm run deploy` deploys the Worker and applies `0005_mobile_push.sql`. The
matching Drizzle schema and migration metadata are included. No existing data
is dropped. Provider keys remain server-side; device tokens are never returned
by the management endpoint or written to logs.

Before declaring push working, test each platform with real configured keys:
register, trigger a genuine watch change, wait for a scheduler run, confirm the
lock-screen notification, tap into Alert inbox, test foreground delivery,
disable/re-enable, sign out, and revoke the device from another signed-in
session. Repeat on a device with notifications denied. No delivery has been
verified until those physical-device tests pass.
