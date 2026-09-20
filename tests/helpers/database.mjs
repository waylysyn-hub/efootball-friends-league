import { PGlite } from '@electric-sql/pglite';

// The same contract suite can exercise native PostgreSQL and its safeupdate
// extension in CI; PGlite remains the default for quick, isolated local tests.
export async function createTestDatabase() {
  if (!process.env.EFL_NATIVE_POSTGRES) return new PGlite();
  const { Client } = await import('pg');
  const client = new Client();
  await client.connect();
  const db = {
    exec: sql => client.query(sql),
    query: (sql, values) => client.query(sql, values),
    close: () => client.end(),
    async transaction(action) {
      await client.query('begin');
      try {
        const result = await action(db);
        await client.query('commit');
        return result;
      } catch (error) {
        await client.query('rollback');
        throw error;
      }
    },
  };
  return db;
}
