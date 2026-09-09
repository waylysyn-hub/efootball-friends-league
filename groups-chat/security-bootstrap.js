/* Secure chat bootstrap: loaded before api.js/script.js. */
'use strict';

document.addEventListener('DOMContentLoaded', async () => {
  const sb = chatClient();
  if (!sb) return;

  handleLogout = async function () {
    currentUser = null;
    try { await EFLAuth.signOut(sb); } catch (_) {}
    chatUnsubscribe(messageChannel);
    messageChannel = null;
    try { localStorage.removeItem('efl_user'); } catch (_) {}
    el('loginScreen').classList.remove('hidden');
    el('appRoot').classList.add('hidden');
  };

  try {
    const profile = await EFLAuth.restore(sb);
    if (profile?.name) {
      currentUser = profile.name;
      try { localStorage.setItem('efl_last_user', currentUser); } catch (_) {}
      await enterApp();
    } else {
      const remembered = localStorage.getItem('efl_last_user');
      if (remembered) el('loginUsername').value = remembered;
    }
  } catch (error) {
    console.warn('[Chat auth] session restore failed:', error?.message || error);
  }
});
