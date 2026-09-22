import { displayName, playerInitials } from '../../shared/locale.js';
import { applyAdminUI } from './admin.js';
import { closeSidebar, navigateTo, showError } from './ui.js';
import { closeDialog, errorMessage, withBusy } from '../../shared/ui.js';
import { sb, state } from './state.js';
import { fetchAllData } from './api.js';
import { stopRealtime, subscribeRealtime } from './realtime.js';
import { populateSeasonDropdowns } from './seasons.js';
import { computeLeagueTable } from './standings.js';
import { nickChip } from './profiles.js';

export function showLogin() {
  document.querySelector('.skip-link')?.setAttribute('href', '#loginForm');
  document.getElementById('loginScreen')?.classList.remove('hidden');
  document.getElementById('mainApp')?.classList.add('hidden');
  document.getElementById('loginPassword').value = '';
  applyAdminUI();
  closeSidebar();
}

export async function handleLogin() {
  const username = document.getElementById('loginUsername').value;
  const passwordInput = document.getElementById('loginPassword');
  const error = document.getElementById('loginError');
  if (!username) return showError(error, "اختر حسابك للمتابعة.");
  if (!passwordInput.value) return showError(error, "أدخل كلمة المرور.");
  return withBusy('login', document.getElementById('loginButton'), async () => {
    state.signingIn = true;
    error.classList.add('hidden');
    try {
      const profile = await window.EFLAuth.signIn(sb, username, passwordInput.value);
      passwordInput.value = '';
      state.profile = profile;
      state.user = profile.name;
      window.EFLAuth.remember(profile.name);
      await fetchAllData();
      enterApp();
    } catch (failure) {
      state.profile = null;
      state.user = null;
      showError(error, errorMessage(failure, failure?.code === 'invalid_credentials'
        ? "اسم اللاعب أو كلمة المرور غير صحيح. حاول مجددًا."
        : "تعذّر الدخول أو تحميل الدوري. حاول مجددًا."));
    } finally { state.signingIn = false; }
  }, "جارٍ تسجيل الدخول…");
}

export async function handleLogout() {
  return withBusy('logout', document.getElementById('logoutButton'), async () => {
    await window.EFLAuth.signOut(sb);
    clearSession();
  }, "جارٍ تسجيل الخروج…");
}

export function clearSession() {
  state.profile = null;
  state.user = null;
  state.questionId = null;
  state.matchId = null;
  stopRealtime();
  closeDialog('editMatchModal');
  closeDialog('squadPlayerModal');
  closeDialog('confirmModal');
  showLogin();
}

export function enterApp() {
  if (!state.user || !state.profile) return;
  document.querySelector('.skip-link')?.setAttribute('href', '#mainContent');
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('mainApp').classList.remove('hidden');
  updateSidebarPlayer();
  applyAdminUI();
  populateSeasonDropdowns();
  subscribeRealtime();
  const page = location.hash.slice(1);
  const target = [...document.querySelectorAll('.nav-item[data-page]')].find(link => link.dataset.page === page);
  navigateTo(target ? page : 'dashboard', target);
}

export function updateSidebarPlayer() {
  if (!state.user) return;
  document.getElementById('sidebarPlayerName').textContent = displayName(state.user);
  document.getElementById('sidebarAvatar').textContent = playerInitials(state.user);
  document.getElementById('topbarPlayer').textContent = displayName(state.user);
  const rank = computeLeagueTable('all').findIndex(row => row.player === state.user) + 1;
  document.getElementById('sidebarPlayerRank').textContent = rank ? `الترتيب: ${rank}` : "غير مصنّف";
  document.getElementById('sidebarNick').innerHTML = nickChip(state.user);
}
