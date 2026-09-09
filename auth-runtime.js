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
      // The old app used this key as an authentication marker. Never trust it.
      const remembered = localStorage.getItem('efl_user');
      if (remembered) localStorage.setItem('efl_last_user', remembered);
      localStorage.removeItem('efl_user');

      // Older builds cached plaintext account passwords. Purge that cache once.
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

  async function getProfile(client, userId) {
    if (!client || !userId) return null;
    const { data, error } = await client
      .from('players')
      .select('name, role, auth_user_id, created')
      .eq('auth_user_id', userId)
      .maybeSingle();
    if (error) throw error;
    return data || null;
  }

  async function restore(client) {
    if (!client) return null;
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    const user = data?.session?.user;
    if (!user) return null;
    const profile = await getProfile(client, user.id);
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

    const profile = await getProfile(client, data.user.id);
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

    const { data: existing, error: existingError } = await adminClient
      .from('players')
      .select('name, auth_user_id')
      .eq('name', name)
      .maybeSingle();
    if (existingError) throw existingError;
    if (!existing) throw new Error('Player profile does not exist.');
    if (existing.auth_user_id) {
      throw new Error('This player already has a secure login. Reset it from Supabase Auth if needed.');
    }

    const isolated = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
        storageKey: `efl-account-create-${Date.now()}-${Math.random()}`,
      },
    });

    const { data, error } = await isolated.auth.signUp({
      email: emailForName(name),
      password,
      options: { data: { league_name: name } },
    });
    if (error) throw error;
    if (!data?.user?.id) throw new Error('Supabase did not return the created user.');

    const { error: linkError } = await adminClient
      .from('players')
      .update({ auth_user_id: data.user.id })
      .eq('name', name)
      .is('auth_user_id', null);
    if (linkError) throw linkError;

    return { id: data.user.id, email: emailForName(name) };
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
