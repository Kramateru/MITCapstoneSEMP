const { createClient } = require('@supabase/supabase-js');
const url = process.argv[1];
const serviceKey = process.argv[2];
const anonKey = process.argv[3];
async function test(label, key) {
  const client = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  try {
    const result = await client.from('training_assessment_categories').select('*').limit(1);
    console.log(label + ':' + JSON.stringify({ error: result.error ? result.error.message : null, rows: Array.isArray(result.data) ? result.data.length : null }));
  } catch (error) {
    console.log(label + ':' + JSON.stringify({ thrown: String(error && error.message || error) }));
  }
}
(async () => { await test('service', serviceKey); await test('anon', anonKey); })();
