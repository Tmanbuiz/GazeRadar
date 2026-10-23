import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const configPath = fileURLToPath(new URL('../dist/server/wrangler.json', import.meta.url));
let config;
try { config = JSON.parse(readFileSync(configPath, 'utf8')); }
catch { throw new Error('Build first with pnpm run build. No generated Worker configuration was found.'); }
const binding = config.d1_databases?.find(item => item.binding === 'DB');
if (!binding || binding.database_id === '00000000-0000-4000-8000-000000000000') {
  throw new Error('D1 configuration is missing or still uses the preview placeholder. Rebuild the latest source.');
}
const wrangler = fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url));
function run(args) {
  const result = spawnSync(process.execPath, [wrangler, ...args], { stdio: 'inherit', env: process.env });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
// Provision first: Wrangler writes the real resource ID into its generated config.
run(['deploy', '--config', configPath]);
run(['d1', 'migrations', 'apply', 'DB', '--remote', '--config', configPath]);
console.log('GazeRadar Worker deployed and D1 migrations applied.');
