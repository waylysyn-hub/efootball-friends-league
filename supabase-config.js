/* =====================================================
   SUPABASE CONFIGURATION
   -----------------------------------------------------
   The publishable/anon key is intentionally browser-visible. Real access is
   enforced by Supabase Auth + Row Level Security from
   supabase-security-migration.sql.
===================================================== */

const SUPABASE_CONFIG = {
  url: 'https://hyqedsydyqbcgusjthcj.supabase.co',
  anonKey: 'sb_publishable_F2AndZb1gX44IwjsWdh5Gg_-K2gevC3',
};

/*
 * Load the secure compatibility layer synchronously while the HTML parser is
 * still blocked on this config file. This lets the project keep its existing
 * no-build static deployment while moving authentication/authorization out of
 * localStorage and plaintext database passwords.
 */
(function bootstrapSecurityRuntime() {
  if (typeof document === 'undefined' || document.readyState !== 'loading') return;

  const path = location.pathname.replace(/\\/g, '/');
  const inLeague = path.includes('/league/');
  const inChat = path.includes('/groups-chat/');

  if (!inLeague && !inChat) return;

  const rootPrefix = '../';
  document.write(`<script src="${rootPrefix}auth-runtime.js"></script>`);
  document.write('<script src="security-bootstrap.js"></script>');
})();
