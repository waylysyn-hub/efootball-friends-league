import fs from 'node:fs';
import { Client } from 'pg';

// This suite must never seed, reset, or log in to a hosted league.
export function localConfig() {
  if (process.env.EFL_LOCAL_E2E !== '1' || !process.env.EFL_E2E_CONFIG) throw new Error('Explicit local E2E configuration is required');
  const config = JSON.parse(fs.readFileSync(process.env.EFL_E2E_CONFIG, 'utf8'));
  for (const [key, port] of [['API_URL', '54321'], ['DB_URL', '54322']]) {
    const url = new URL(config[key]);
    if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.port !== port) throw new Error('E2E is restricted to the isolated local Supabase ports');
  }
  return config;
}

export async function query(sql, values = []) {
  const db = new Client({ connectionString: localConfig().DB_URL });
  await db.connect();
  try { return (await db.query(sql, values)).rows; }
  finally { await db.end(); }
}
