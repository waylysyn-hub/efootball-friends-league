import fs from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { Client } from 'pg';
import { localConfig } from './local-backend.mjs';

const config = localConfig();
const db = new Client({ connectionString: config.DB_URL });
await db.connect();
try {
  const core = ['supabase-schema.sql', 'supabase-groups-chat-migration.sql', 'supabase-security-migration.sql', 'supabase-derived-data-migration.sql', 'supabase-consistency-migration.sql'];
  const additive = (await fs.readdir('supabase/migrations')).filter(name => name.endsWith('.sql')).sort().map(name => 'supabase/migrations/' + name);
  for (const file of [...core, ...additive]) await db.query(await fs.readFile(file, 'utf8'));
  config.testPassword = randomBytes(24).toString('base64url');
  const players = (await db.query('select name,id from public.players order by name')).rows;
  for (const { name } of players) {
    const response = await fetch(config.API_URL + '/auth/v1/admin/users', {
      method: 'POST', headers: { apikey: config.SERVICE_ROLE_KEY, Authorization: 'Bearer ' + config.SERVICE_ROLE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: name.toLowerCase().replaceAll(' ', '-') + '@efootball-friends.example', password: config.testPassword, email_confirm: true }),
    });
    if (!response.ok) throw new Error('Local Auth test-user creation failed: ' + response.status);
    const user = await response.json();
    await db.query('insert into public.player_accounts(name,auth_user_id) values($1,$2)', [name, user.id]);
    await db.query("insert into public.squad_players(owner,name,position) values($1,'Zlatan','FW'),($1,'Ronaldinho','MF')", [name]);
  }
  await db.query("notify pgrst, 'reload schema'");
  await fs.writeFile(process.env.EFL_E2E_CONFIG, JSON.stringify(config), { mode: 0o600 });
  console.log('Isolated Supabase seeded with six disposable Auth accounts and squad UUIDs.');
} finally { await db.end(); }
