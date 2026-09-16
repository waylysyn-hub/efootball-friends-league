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

      localStorage.removeItem('efl_cache');
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
    const { error } = await client.auth.signOut();
    if (error) throw error;
  }

  function remember(name) {
    try { localStorage.setItem('efl_last_user', name); } catch (_) { /* Storage is optional. */ }
  }

  function lastPlayer() {
    try { return localStorage.getItem('efl_last_user') || ''; } catch (_) { return ''; }
  }

  // Keep Supabase API calls outside the auth callback to avoid auth-lock deadlocks.
  function subscribe(client, onChange) {
    if (!client) return () => {};
    let revision = 0;
    const { data } = client.auth.onAuthStateChange((event, session) => {
      const ticket = ++revision;
      if (event === 'SIGNED_OUT') {
        onChange(null, event);
        return;
      }
      if (!session || event === 'INITIAL_SESSION') return;
      setTimeout(async () => {
        try {
          const profile = await getProfile(client);
          if (ticket === revision) onChange(profile, event);
        } catch (error) {
          console.warn('[Auth] Profile refresh unavailable:', error?.code || 'network');
          if (ticket === revision) onChange(null, 'PROFILE_UNAVAILABLE');
        }
      }, 0);
    });
    return () => { revision++; data.subscription.unsubscribe(); };
  }

  sanitizeLegacyStorage();

  window.EFLAuth = Object.freeze({
    emailForName,
    getProfile,
    restore,
    signIn,
    signOut,
    subscribe,
    remember,
    lastPlayer,
    sanitizeLegacyStorage,
  });
})();
