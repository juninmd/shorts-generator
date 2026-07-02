const fs = require('fs');
const out = [];
const log = (...a)=>out.push(a.map(x=>typeof x==='string'?x:JSON.stringify(x,null,2)).join(' '));
const { Client } = require('/app/node_modules/pg');
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const q = async (label, sql, params=[]) => {
    try { const r = await c.query(sql, params); log("## "+label+" ("+r.rows.length+")"); log(r.rows); }
    catch(e){ log("## "+label+" ERR "+e.message); }
  };
  await q("psv_cols", "SELECT column_name FROM information_schema.columns WHERE table_name='posted_source_videos'");
  await q("psv_counts_by_ch", "SELECT channel_id, count(*), max(created_at) AS last FROM posted_source_videos GROUP BY channel_id");
  await q("psv_santid_recent", "SELECT * FROM posted_source_videos WHERE channel_id='santidade-catolica' ORDER BY created_at DESC LIMIT 15");
  await q("santid_runs", "SELECT id, status, jsonb_array_length(COALESCE(results,'[]'::jsonb)) AS n_results, error_message, created_at, updated_at FROM pipeline_runs WHERE channel_id='santidade-catolica' ORDER BY created_at DESC LIMIT 20");
  await c.end();
  fs.writeFileSync('/tmp/qout.txt', out.join('\n'));
})().catch(e=>{ fs.writeFileSync('/tmp/qout.txt', out.join('\n')+'\nERR '+e.message); });
