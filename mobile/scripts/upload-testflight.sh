#!/usr/bin/env bash
set -euo pipefail
umask 077
sign_dir="$RUNNER_TEMP/gazeradar-signing"
keychain="$RUNNER_TEMP/gazeradar-signing.keychain-db"
mkdir -p "$sign_dir/private_keys"
export GAZE_SIGN_DIR="$sign_dir"
python3 - <<'PY'
import base64, os, pathlib, re
p = pathlib.Path(os.environ['GAZE_SIGN_DIR'])
for variable, filename in [('BUILD_CERTIFICATE_BASE64', 'certificate.p12'), ('BUILD_PROVISION_PROFILE_BASE64', 'profile.mobileprovision')]:
    (p / filename).write_bytes(base64.b64decode(os.environ[variable]))
key_id = os.environ['APP_STORE_CONNECT_KEY_ID']
assert re.fullmatch(r'[A-Za-z0-9]+', key_id), 'Invalid Apple API key ID'
(p / 'private_keys' / f'AuthKey_{key_id}.p8').write_text(os.environ['APP_STORE_CONNECT_PRIVATE_KEY'])
PY
security cms -D -i "$sign_dir/profile.mobileprovision" > "$sign_dir/profile.plist"
python3 - <<'PY'
import datetime, hashlib, os, pathlib, plistlib
p = pathlib.Path(os.environ['GAZE_SIGN_DIR'])
profile = plistlib.loads((p / 'profile.plist').read_bytes())
e = profile['Entitlements']
team, bundle = os.environ['APPLE_TEAM_ID'], os.environ['APPLE_BUNDLE_ID']
assert profile['TeamIdentifier'] == [team], 'Wrong Apple team in profile'
assert e['application-identifier'] == f'{team}.{bundle}', 'Wrong app in profile'
assert not e.get('get-task-allow', False), 'Use a distribution profile'
assert not profile.get('ProvisionedDevices') and not profile.get('ProvisionsAllDevices'), 'Use an App Store Connect distribution profile'
assert e.get('aps-environment') == 'production', 'Profile must enable production push'
assert profile['ExpirationDate'] > datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None), 'Profile expired'
(p / 'uuid').write_text(profile['UUID'])
(p / 'identity').write_text(hashlib.sha1(profile['DeveloperCertificates'][0]).hexdigest().upper())
plistlib.dump({'method':'app-store-connect', 'destination':'export', 'teamID':team,
  'signingStyle':'manual', 'signingCertificate':(p / 'identity').read_text(),
  'provisioningProfiles':{bundle:profile['UUID']}, 'uploadSymbols':True}, (p / 'ExportOptions.plist').open('wb'))
PY
profile_uuid="$(cat "$sign_dir/uuid")"
identity="$(cat "$sign_dir/identity")"
keychain_password="$(openssl rand -hex 24)"
echo "::add-mask::$keychain_password"
security create-keychain -p "$keychain_password" "$keychain"
security set-keychain-settings -lut 21600 "$keychain"
security unlock-keychain -p "$keychain_password" "$keychain"
bash mobile/scripts/prepare-signing-p12.sh "$sign_dir/certificate.p12" "$sign_dir/certificate-macos.p12"
security import "$sign_dir/certificate-macos.p12" -P "$P12_PASSWORD" -T /usr/bin/codesign -T /usr/bin/security -k "$keychain" >/dev/null
security set-key-partition-list -S apple-tool:,apple:,codesign: -k "$keychain_password" "$keychain" >/dev/null
security list-keychains -d user -s "$keychain" login.keychain-db
mkdir -p "$HOME/Library/MobileDevice/Provisioning Profiles"
cp "$sign_dir/profile.mobileprovision" "$HOME/Library/MobileDevice/Provisioning Profiles/$profile_uuid.mobileprovision"
trap 'rm -f "$HOME/Library/MobileDevice/Provisioning Profiles/$profile_uuid.mobileprovision"' EXIT
# Keep build numbers increasing across retries without touching the source project.
build_number="$(python3 -c 'import datetime; n=datetime.datetime.now(datetime.timezone.utc); print(f"{(n.date()-datetime.date(2020,1,1)).days}.{n.hour}.{n.minute}")')"
xcodebuild -project mobile/ios/App/App.xcodeproj -scheme App -configuration Release \
  -destination 'generic/platform=iOS' -archivePath build/GazeRadar.xcarchive \
  DEVELOPMENT_TEAM="$APPLE_TEAM_ID" CODE_SIGN_STYLE=Manual \
  CODE_SIGN_IDENTITY="$identity" PROVISIONING_PROFILE_SPECIFIER="$profile_uuid" \
  CURRENT_PROJECT_VERSION="$build_number" APS_ENVIRONMENT=production archive
xcodebuild -exportArchive -archivePath build/GazeRadar.xcarchive \
  -exportPath build/testflight -exportOptionsPlist "$sign_dir/ExportOptions.plist"
ipa_path="$(find build/testflight -maxdepth 1 -name '*.ipa' -print -quit)"
test -n "$ipa_path"
export API_PRIVATE_KEYS_DIR="$sign_dir/private_keys"
xcrun altool --validate-app -f "$ipa_path" -t ios --apiKey "$APP_STORE_CONNECT_KEY_ID" --apiIssuer "$APP_STORE_CONNECT_ISSUER_ID"
xcrun altool --upload-app -f "$ipa_path" -t ios --apiKey "$APP_STORE_CONNECT_KEY_ID" --apiIssuer "$APP_STORE_CONNECT_ISSUER_ID"
echo 'Upload accepted. Check GazeRadar > TestFlight in App Store Connect for processing.' >> "$GITHUB_STEP_SUMMARY"
