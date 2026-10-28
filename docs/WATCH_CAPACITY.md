# Watch capacity

Ordinary accounts have a 20-watch limit. The owner-requested exemption is configured
in the server-only `WATCH_UNLIMITED_EMAIL_HASHES` Worker variable in `wrangler.json`.
It contains comma-separated SHA-256 hashes of normalized, verified GazeRadar login
emails. These hashes are configuration, not passwords or authentication tokens.

The server resolves the authenticated owner to the existing users table. A
connected Gmail address, request-body email, browser state, or arbitrary Access
subject cannot claim an exemption. No authentication behavior changes. The
authenticated notification-settings response reports `watchLimit: null` for an
exempt account, and Settings displays "No watch count limit".

Only the count limit is removed for allowlisted accounts. URL validation,
duplicate checks, request size limits, ownership checks, check throttles, bounded
scheduler batches and delivery limits remain in effect. An unlimited count does
not guarantee unlimited processing throughput or exact checking times, and may
increase the owner's Cloudflare usage. No schema migration is required.
