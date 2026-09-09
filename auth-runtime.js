/* =====================================================
   eFootball Friends League — shared secure auth helpers
   ===================================================== */

(function () {
  'use strict';

  const AUTH_DOMAIN = 'efootball-friends.example';

  function slugifyName(name) {
    return String(name || '')
      .normalize('NFKD')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'player';
  }

  function emailForName(name) {
    return `${slugifyName(name)}@${AUTH_DOMAIN}`;
  }

  function sanitizeLegacyStorage() {
    try {
      const remembered = localStorage.getItem('efl_user');
      if (remembered) localStorage.setItem('efl_last_user', remembered);
      localStorage.removeItem('efl_user');

      const raw = localStorage.getItem('efl_cache');
      if (raw) {
        const cache = JSON.parse(raw);
        if (cache && cache.accounts) {
          Object.values(cache.accounts).forEach((account) => {
            if (account && typeof account === 'object') delete account.password;
          });
          localStorage.setItem('efl_cache', JSON.stringify(cache));
        }
      }
    } catch (_) {}
  }

  async function getProfile(client) {
    if (!client) return null;

    const { data: account, error: accountError } = await client
      .from('player_accounts')
      .select('name')
      .maybeSingle();
    if (accountError) throw accountError;
    if (!account?.name) return null;

    const { data: profile, error: profileError } = await client
      .from('players')
      .select('name, role, created')
      .eq('name', account.name)
      .maybeSingle();
    if (profileError) throw profileError;
    return profile || null;
  }

  async function restore(client) {
    if (!client) return null;
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    if (!data?.session?.user) return null;

    const profile = await getProfile(client);
    if (!profile) {
      await client.auth.signOut();
      return null;
    }
    return profile;
  }

  async function signIn(client, name, password) {
    if (!client) throw new Error('Supabase is not configured.');
    const { data, error } = await client.auth.signInWithPassword({
      email: emailForName(name),
      password,
    });
    if (error || !data?.user) throw error || new Error('Invalid username or password.');

    const profile = await getProfile(client);
    if (!profile || profile.name !== name) {
      await client.auth.signOut();
      throw new Error('This login is not linked to the selected league account.');
    }
    return profile;
  }

  async function signOut(client) {
    if (!client) return;
    await client.auth.signOut();
  }

  async function createPlayerAccount(adminClient, name, password) {
    if (!adminClient) throw new Error('Supabase is not configured.');
    if (!name) throw new Error('Choose a player.');
    if (!password || password.length < 8) {
      throw new Error('Password must be at least 8 characters.');
    }

    const { data, error } = await adminClient.functions.invoke('manage-player-account', {
      body: { name, password },
    });

    if (error) throw error;
    if (!data?.ok) throw new Error(data?.error || 'Could not update player account.');
    return data;
  }

  sanitizeLegacyStorage();

  window.EFLAuth = Object.freeze({
    emailForName,
    getProfile,
    restore,
    signIn,
    signOut,
    createPlayerAccount,
    sanitizeLegacyStorage,
  });
})();
