/*
  Customer-requested deletion / security revocation for one submission.

  Deletes the submission and, by cascade, its orders, jobs, research sources,
  reports, claims, access tokens and delivery attempts; removes PDF objects
  from the private bucket; webhook ledger rows keep only the order id set to
  null. Run from a trusted machine with the server key; never from the browser.

  Usage:
    SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=sb_secret_... node scripts/delete-order.mjs <submission uuid> [--revoke-only]

  --revoke-only  revokes every access token for the submission's orders and
                 leaves the data in place (security revocation; recovery can
                 re-issue links).
*/
import { createClient } from '@supabase/supabase-js';

const [submissionId, flag] = process.argv.slice(2);
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key || !submissionId) {
  console.error('Usage: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/delete-order.mjs <submission uuid> [--revoke-only]');
  process.exit(2);
}
const sb = createClient(url, key, { auth: { persistSession: false } });
const { data: orders, error } = await sb.from('orders').select('id').eq('submission_id', submissionId);
if (error) throw error;
const ids = (orders ?? []).map((o) => o.id);
console.log(`submission ${submissionId}: ${ids.length} order(s)`);

if (ids.length) {
  const rev = await sb.from('access_tokens').update({ revoked_at: new Date().toISOString() }).in('order_id', ids).is('revoked_at', null).select('id');
  if (rev.error) throw rev.error;
  console.log(`revoked ${rev.data?.length ?? 0} access token(s)`);
}
if (flag === '--revoke-only') process.exit(0);

for (const id of ids) {
  const list = await sb.storage.from('reports').list(`orders/${id}`);
  const paths = (list.data ?? []).map((f) => `orders/${id}/${f.name}`);
  if (paths.length) {
    const del = await sb.storage.from('reports').remove(paths);
    if (del.error) throw del.error;
    console.log(`removed ${paths.length} PDF object(s) for order ${id}`);
  }
}
const del = await sb.from('submissions').delete().eq('id', submissionId);
if (del.error) throw del.error;
console.log('submission and dependent rows deleted');
