export function selectAccount(configuredId, accounts) {
  if (configuredId) return configuredId;
  if (Array.isArray(accounts) && accounts.length === 1 && accounts[0].id) return accounts[0].id;
  throw new Error('Set CLOUDFLARE_ACCOUNT_ID in the Cloudflare build environment so the deployment account is unambiguous.');
}
export function attachedDatabaseId(settings, bindingName = 'DB') {
  const matches = settings?.bindings?.filter(binding => binding.type === 'd1' && binding.name === bindingName) ?? [];
  if (matches.length !== 1) throw new Error('The deployed Worker must have exactly one D1 binding named DB. Check Workers & Pages → gazeradar → Bindings.');
  const id = matches[0].id || matches[0].database_id;
  if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id || '') || id === '00000000-0000-4000-8000-000000000000') {
    throw new Error('The Worker DB binding has no usable database ID. Attach a real D1 database named gazeradar-db in the Cloudflare dashboard.');
  }
  return id;
}
