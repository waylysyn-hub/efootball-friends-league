/* One Supabase client per page; configuration remains data only. */
(function () {
  'use strict';
  let client = null;
  function get() {
    if (client) return client;
    const config = window.SUPABASE_CONFIG;
    if (!window.supabase?.createClient || !config?.url || !config?.anonKey ||
        config.url.includes('YOUR_') || config.anonKey.includes('YOUR_')) return null;
    client = window.supabase.createClient(config.url, config.anonKey);
    return client;
  }
  window.EFLClient = Object.freeze({ get });
})();
