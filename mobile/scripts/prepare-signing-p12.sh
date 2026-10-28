#!/usr/bin/env bash
set -euo pipefail
umask 077

# macOS Security.framework can reject OpenSSL 3's PBES2 PKCS#12 defaults
# with "MAC verification failed", even when the password is correct.
# Preserve the stored credentials; convert only the temporary runner copy.
source_p12="$1"
compatible_p12="$2"
openssl_bin="${GAZE_OPENSSL:-openssl}"
encrypted_pem="$(mktemp "${compatible_p12}.XXXXXX")"
trap 'rm -f "$encrypted_pem"' EXIT

if ! "$openssl_bin" pkcs12 -in "$source_p12" -passin env:P12_PASSWORD -noout 2>/dev/null; then
  echo '::error::Cannot open the signing P12. Check that BUILD_CERTIFICATE_BASE64 and P12_PASSWORD were copied from the same signing bundle.' >&2
  exit 1
fi

# Keep the intermediate private key encrypted as well as permission-restricted.
"$openssl_bin" pkcs12 -in "$source_p12" -passin env:P12_PASSWORD \
  -out "$encrypted_pem" -passout env:P12_PASSWORD 2>/dev/null
"$openssl_bin" pkcs12 -export -in "$encrypted_pem" -passin env:P12_PASSWORD \
  -out "$compatible_p12" -passout env:P12_PASSWORD \
  -keypbe PBE-SHA1-3DES -certpbe PBE-SHA1-3DES -macalg sha1 -iter 20000
"$openssl_bin" pkcs12 -in "$compatible_p12" -passin env:P12_PASSWORD -noout
echo 'Signing P12 password verified; macOS-compatible import copy prepared.'
