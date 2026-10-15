/*
  Black-box RLS check: uses a PUBLIC key (anon JWT or sb_publishable_…) to try
  to read every customer table and the private PDF bucket. Every attempt must
  fail or return zero rows. Secrets are never needed.

  Usage:
    SUPABASE_URL=https://<ref>.supabase.co SUPABASE_PUBLIC_KEY=sb_publishable_... node scripts/verify-rls.mjs
*/
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_PUBLIC_KEY;
if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_PUBLIC_KEY (the anon/publishable key, never a secret key).');
  process.exit(2);
}
if (key.startsWith('sb_secret_') || /"role":"service_role"/.test(Buffer.from(key.split('.')[1] ?? '', 'base64').toString())) {
  console.error('Refusing to run with a secret/service-role key: this check must use a public key.');
  process.exit(2);
}

const sb = createClient(url, key, { auth: { persistSession: false } });
const tables = ['submissions', 'orders', 'jobs', 'research_sources', 'reports', 'report_claims', 'access_tokens', 'webhook_events', 'delivery_attempts', 'rate_limits'];
let failures = 0;

for (const t of tables) {
  const { data, error } = await sb.from(t).select('*').limit(1);
  const blocked = !!error || (Array.isArray(data) && data.length === 0);
  console.log(`${blocked ? 'OK ' : 'FAIL'} table ${t}: ${error ? `denied (${error.code ?? error.message})` : `${data?.length ?? 0} rows readable`}`);
  if (!blocked) failures += 1;
  const ins = await sb.from(t).insert({}).select();
  if (!ins.error) {
    console.log(`FAIL table ${t}: public insert succeeded`);
    failures += 1;
  }
}

const list = await sb.storage.from('reports').list('orders', { limit: 1 });
const listBlocked = !!list.error || (list.data?.length ?? 0) === 0;
console.log(`${listBlocked ? 'OK ' : 'FAIL'} bucket reports: ${list.error ? `denied (${list.error.message})` : `${list.data?.length ?? 0} objects listable`}`);
if (!listBlocked) failures += 1;

const dl = await sb.storage.from('reports').download('orders/00000000-0000-0000-0000-000000000000/report-v1.pdf');
console.log(`${dl.error ? 'OK ' : 'FAIL'} bucket reports: direct download ${dl.error ? 'denied' : 'ALLOWED'}`);
if (!dl.error) failures += 1;

const rpc = await sb.rpc('claim_job', { p_job_id: '00000000-0000-0000-0000-000000000000', p_worker_id: 'x', p_lease_seconds: 1 });
console.log(`${rpc.error ? 'OK ' : 'FAIL'} rpc claim_job: ${rpc.error ? 'denied' : 'ALLOWED'}`);
if (!rpc.error) failures += 1;

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll public-access checks passed: customer data is not readable with a public key.');
process.exit(failures ? 1 : 0);
