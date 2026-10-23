import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { selectAccount, attachedDatabaseId } from './cloudflare-bindings.mjs';
const configPath = fileURLToPath(new URL('../dist/server/wrangler.json', import.meta.url));
let config;
try { config = JSON.parse(readFileSync(configPath, 'utf8')); }
catch { throw new Error('Build first with pnpm run build. No generated Worker configuration was found.'); }
const binding = config.d1_databases?.find(item => item.binding === 'DB');
if (!binding || binding.database_id === '00000000-0000-4000-8000-000000000000') {
  throw new Error('D1 configuration is missing or still uses the preview placeholder. Rebuild the latest source.');
}
const wrangler = fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url));
function run(args, capture = false) {
  const result = spawnSync(process.execPath, [wrangler, ...args], {
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit', encoding: 'utf8', env: process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    if (capture) throw new Error('Could not determine the Cloudflare account. Set CLOUDFLARE_ACCOUNT_ID in build variables.');
    process.exit(result.status ?? 1);
  }
  return result.stdout;
}
// Provisioning may retain an inherited binding without writing its ID back locally.
run(['deploy', '--config', configPath]);
config = JSON.parse(readFileSync(configPath, 'utf8'));
const deployedBinding = config.d1_databases.find(item => item.binding === 'DB');
if (!deployedBinding.database_id) {
  const accountFromEnv = process.env.CLOUDFLARE_ACCOUNT_ID || process.env.CF_ACCOUNT_ID || config.account_id;
  let accounts = [];
  if (!accountFromEnv) {
    const raw = run(['whoami', '--json'], true);
    try { accounts = JSON.parse(raw).accounts; }
    catch { throw new Error('Could not parse Wrangler account information. Set CLOUDFLARE_ACCOUNT_ID in build variables.'); }
  }
  const accountId = selectAccount(accountFromEnv, accounts);
  const token = process.env.CLOUDFLARE_API_TOKEN || process.env.CF_API_TOKEN;
  const key = process.env.CLOUDFLARE_API_KEY || process.env.CF_API_KEY;
  const email = process.env.CLOUDFLARE_EMAIL || process.env.CF_EMAIL;
  const headers = token ? { Authorization: `Bearer ${token}` } : key && email ? { 'X-Auth-Key': key, 'X-Auth-Email': email } : null;
  if (!headers) throw new Error('Cloudflare build credentials were not available to resolve the deployed DB binding. Configure CLOUDFLARE_API_TOKEN in the build environment.');
  if (!/^[a-f0-9]{32}$/i.test(accountId) || !config.name) throw new Error('Cloudflare account or Worker name is invalid.');
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${encodeURIComponent(config.name)}/settings`, { headers, signal: AbortSignal.timeout(20000) });
  const payload = await response.json();
  if (!response.ok || !payload.success) throw new Error(`Unable to read the deployed Worker bindings (HTTP ${response.status}). The build token needs Workers Scripts Read/Edit permission.`);
  deployedBinding.database_id = attachedDatabaseId(payload.result);
  config.account_id = accountId;
  // Only generated deployment metadata is changed; no credential is persisted.
  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
  console.log('Resolved the deployed DB binding for migrations.');
}
run(['d1', 'migrations', 'apply', 'DB', '--remote', '--config', configPath]);
console.log('GazeRadar Worker deployed and D1 migrations applied.');
