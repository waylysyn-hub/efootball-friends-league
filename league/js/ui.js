import { isAdmin } from './admin.js';
import { getActiveSeason, renderSeasons } from './seasons.js';
import { state } from './state.js';
import { renderDashboard } from './dashboard.js';
import { initRecordForm, renderHistory } from './matches.js';
import { renderMatchDetails } from './match-details.js';
import { renderFootballStats, renderH2H, renderRivalries, renderStatistics } from './statistics.js';
import { renderLeagueTable } from './standings.js';
import { getPlayers, selectProfilePlayer } from './profiles.js';
import { renderAwards, selectAchievementsPlayer } from './achievements.js';
import { renderQuestions } from './questions.js';
import { closeDialog, escapeHtml, isBusy, openDialog, showError as showInlineError, toast, withBusy } from '../../shared/ui.js';

export function navigateTo(page, el) {
  if (!isAdmin() && page === 'recordMatch') {
    showToast('Only an administrator can record matches.', true);
    page = 'dashboard';
    el = document.querySelector('.nav-item[data-page="dashboard"]');
  }
  const target = document.getElementById('page-' + page);
  if (target) history.replaceState(null, '', '#' + page);
  if (!target) {
    page = 'dashboard';
  }
  const pageEl = document.getElementById('page-' + page) || document.getElementById('page-dashboard');

  document.querySelectorAll('.page').forEach(p => {
    if (p !== pageEl) p.classList.add('hidden');
  });
  pageEl.classList.remove('hidden');
  pageEl.classList.add('active');

  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  el ||= document.querySelector('.nav-item[data-page="' + page + '"]');
  if (el) el.classList.add('active');
  document.querySelectorAll('.nav-item[data-page]').forEach(link => link.setAttribute('aria-current', link === el ? 'page' : 'false'));

  const titles = {
    dashboard: 'Dashboard', recordMatch: 'Record Match',
    matchHistory: 'Match History', matchDetails: 'Match Details',
    footballStats: 'Player Performance', leagueTable: 'League Table',
    playerProfile: 'Player Profiles', headToHead: 'Head to Head',
    seasons: 'Seasons', awards: 'Awards', achievements: 'Achievements',
    rivalries: 'Rivalries', statistics: 'Statistics', questions: 'League Q&A',
    settings: 'Settings'
  };
  const topTitle = document.getElementById('topbarTitle');
  if (topTitle) topTitle.textContent = titles[page] || page;

  const activeSeason = getActiveSeason();
  const topSeason = document.getElementById('topbarSeason');
  if (topSeason) topSeason.textContent = activeSeason ? activeSeason.name : 'No Season';

  closeSidebar();
  if (page !== 'questions') state.questionId = null;
  state.page = page;
  try {
    renderPage(page);
  } catch (e) {
    console.error('renderPage failed:', page, e);
    showToast('Could not load this page.', true);
  }
}

export function renderPage(page) {
  switch(page) {
    case 'dashboard': renderDashboard(); break;
    case 'matchHistory': renderHistory(); break;
    case 'matchDetails': renderMatchDetails(); break;
    case 'footballStats': renderFootballStats(); break;
    case 'leagueTable': renderLeagueTable(); break;
    case 'playerProfile': {
      const first = state.selectedProfile || state.user || getPlayers()[0];
      if (first) selectProfilePlayer(first);
      break;
    }
    case 'seasons': renderSeasons(); break;
    case 'awards': renderAwards(); break;
    case 'achievements': {
      const first = state.selectedAchievements || state.user || getPlayers()[0];
      if (first) selectAchievementsPlayer(first);
      break;
    }
    case 'rivalries': renderRivalries(); break;
    case 'statistics': renderStatistics(); break;
    case 'recordMatch': initRecordForm(); break;
    case 'headToHead': renderH2H(); break;
    case 'questions': renderQuestions(); break;
  }
}

export function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const open = !sidebar.classList.contains('open');
  sidebar.classList.toggle('open', open);
  document.getElementById('sidebarOverlay').classList.toggle('visible', open);
  document.querySelectorAll('[aria-controls="sidebar"]').forEach(button => button.setAttribute('aria-expanded', String(open)));
  if (open) sidebar.querySelector('a')?.focus();
 }

export function closeSidebar() {
  document.getElementById('sidebar')?.classList.remove('open');
  document.getElementById('sidebarOverlay')?.classList.remove('visible');
  document.querySelectorAll('[aria-controls="sidebar"]').forEach(button => button.setAttribute('aria-expanded', 'false'));
 }

export function showError(element, message) { showInlineError(element, message); }

export function showToast(message, isError = false) { toast(message, isError ? 'error' : 'success'); }

export function esc(value) { return escapeHtml(value); }

export function formatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch { return dateStr; }
}

export function showConfirm(title, message, onConfirm) {
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmMessage').textContent = message;
  openDialog('confirmModal', closeConfirmModal);
  const button = document.getElementById('confirmYes');
  button.onclick = () => withBusy('confirm', button, async () => {
    if (!state.user) throw new Error('Session ended');
    await onConfirm(); closeDialog('confirmModal');
  });
 }

export function closeConfirmModal() { if (!isBusy('confirm')) closeDialog('confirmModal'); }
