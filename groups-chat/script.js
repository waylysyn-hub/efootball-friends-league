import * as api from './api.js';
import { escapeHtml as esc, withBusy, errorMessage, toast, showError, openDialog, closeDialog, isBusy, setupDrawer, setupConnectivity, debounce } from '../shared/ui.js';

const el = id => document.getElementById(id);
const initials = name => String(name || '').split(' ').map(word => word[0] || '').slice(0, 2).join('').toUpperCase();
let currentUser = null, groups = [], invitations = [], currentGroup = null;
let messageChannel = null, inviteChannel = null;
let viewVersion = 0, dataVersion = 0;
let loadedMessages = new Map();
let messageDraft = null, groupDraftId = null;
let signingIn = false, messagesLoading = false;
const closeDrawer = setupDrawer({ sidebar: el('sidebar'), overlay: el('sidebarOverlay'), toggles: [el('chatMenuToggle')] });

function showLogin() {
  el('loginScreen').classList.remove('hidden');
  el('appRoot').classList.add('hidden');
  el('loginPassword').value = '';
  closeDrawer();
}
function clearSession() {
  viewVersion++; dataVersion++;
  currentUser = null; currentGroup = null; groups = []; invitations = [];
  loadedMessages.clear(); messageDraft = null; groupDraftId = null;
  api.chatUnsubscribe(messageChannel); api.chatUnsubscribe(inviteChannel);
  messageChannel = null; inviteChannel = null;
  el('messages').replaceChildren(); el('groupsGrid').replaceChildren(); el('invitesList').replaceChildren();
  el('messageInput').value = ''; closeDialog('createGroupModal'); showLogin();
}
async function handleLogin(event) {
  event.preventDefault();
  const username = el('loginUsername').value;
  const password = el('loginPassword');
  if (!username || !password.value) return showError(el('loginError'), 'Choose your player and enter your password.');
  return withBusy('chat-login', el('loginButton'), async () => {
    signingIn = true; el('loginError').hidden = true;
    try {
      currentUser = await api.chatLogin(username, password.value);
      password.value = ''; window.EFLAuth.remember(currentUser);
      await enterApp();
    } catch (error) { showError(el('loginError'), errorMessage(error, 'Could not sign in. Check your player and password, then try again.')); }
    finally { signingIn = false; }
  }, 'Signing in…');
}
async function handleLogout() {
  return withBusy('chat-logout', el('logoutBtn'), async () => {
    await window.EFLAuth.signOut(api.chatClient()); clearSession();
  }, '…');
}
async function populateLoginPlayers() {
  el('loginButton').disabled = true;
  el('loginUsername').disabled = true;
  try {
    const players = await api.chatFetchPlayers();
    el('loginUsername').innerHTML = '<option value="">Choose your player</option>';
    players.forEach(player => {
      const option = document.createElement('option'); option.value = player.name; option.textContent = player.name;
      el('loginUsername').append(option);
    });
    el('loginUsername').value = window.EFLAuth.lastPlayer();
    el('loginButton').disabled = !players.length;
    el('loginError').hidden = true;
    if (!players.length) showError(el('loginError'), 'No players are registered. Please contact the league administrator.');
  } catch { showError(el('loginError'), 'Could not load players. Check your connection and try again.'); }
  finally { el('loginUsername').disabled = false; }
}
function showView(name) {
  if (name !== 'chat') {
    viewVersion++; currentGroup = null; api.chatUnsubscribe(messageChannel); messageChannel = null;
  }
  document.querySelectorAll('.view').forEach(view => view.classList.toggle('active', view.id === 'view-' + name));
  document.querySelectorAll('[data-view]').forEach(link => {
    link.classList.toggle('active', link.dataset.view === name); link.setAttribute('aria-current', link.dataset.view === name ? 'page' : 'false');
  });
  closeDrawer();
}
async function enterApp() {
  el('meAvatar').textContent = initials(currentUser); el('meName').textContent = currentUser;
  el('loginScreen').classList.add('hidden'); el('appRoot').classList.remove('hidden');
  showView('groups');
  api.chatUnsubscribe(inviteChannel);
  inviteChannel = api.chatClient().channel('league-chat-invitations')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_invitations', filter: `invited_player=eq.${currentUser}` }, debounce(refreshAll, 300)).subscribe();
  await refreshAll();
}
async function refreshAll() {
  if (!currentUser) return;
  const ticket = ++dataVersion, player = currentUser;
  try {
    const [nextGroups, nextInvites] = await Promise.all([api.chatFetchGroups(player), api.chatFetchInvitations(player)]);
    if (ticket !== dataVersion || player !== currentUser) return;
    groups = nextGroups; invitations = nextInvites;
    if (currentGroup) {
      const fresh = groups.find(group => group.id === currentGroup.id);
      if (fresh) { currentGroup = fresh; el('chatGroupMeta').textContent = `${fresh.members} members`; el('memberNames').textContent = fresh.memberNames.join(' · '); }
    }
    renderGroups(); renderInvites(); el('chatDataError').hidden = true;
    if (currentGroup && !groups.some(group => group.id === currentGroup.id)) { showView('groups'); toast('Your access to this group has changed.', 'warning'); }
  } catch (error) {
    if (ticket !== dataVersion) return;
    showError(el('chatDataError'), errorMessage(error, 'Could not load your chats. Use Refresh to try again.'));
  }
}
function renderGroups() {
  const search = el('groupSearch').value.trim().toLowerCase();
  const list = groups.filter(group => group.name.toLowerCase().includes(search));
  el('groupsGrid').innerHTML = '';
  el('groupCount').textContent = `${groups.length} ${groups.length === 1 ? 'group' : 'groups'}`;
  if (!list.length) {
    el('groupsGrid').innerHTML = `<div class="empty-inline"><h3>${search ? 'No matching groups' : 'Start the conversation'}</h3><p>${search ? 'Try another group name.' : 'Create a group or accept an invitation to chat with your league.'}</p></div>`;
    return;
  }
  list.forEach(group => {
    const card = document.createElement('article'); card.className = 'group-card';
    card.innerHTML = `<div class="group-top"><div class="avatar group-avatar">${esc(group.emoji || '⚽')}</div><div><h2 class="group-name">${esc(group.name)}</h2><p class="members">${group.members} members</p></div></div>
      <p class="group-desc">${esc(group.description || 'Your league conversation.')}</p>
      <div class="member-preview">${(group.memberNames || []).slice(0,4).map(name => `<span class="mini-avatar" title="${esc(name)}">${esc(initials(name))}</span>`).join('')}</div>
      <button type="button" class="open-btn">Open chat <span aria-hidden="true">→</span></button>`;
    card.querySelector('button').addEventListener('click', () => openChat(group));
    el('groupsGrid').append(card);
  });
}
async function openChat(group) {
  const ticket = ++viewVersion;
  currentGroup = group; loadedMessages = new Map();
  el('chatAvatar').textContent = group.emoji || '⚽';
  el('chatGroupName').textContent = group.name;
  el('chatGroupMeta').textContent = `${group.members} members`;
  el('memberNames').textContent = (group.memberNames || []).join(' · ');
  el('messageInput').value = ''; messageDraft = null;
  el('chatInviteBar').classList.remove('hidden');
  showView('chat');
  el('messages').innerHTML = '<p class="chat-loading loading-spinner" role="status">Loading conversation…</p>';
  el('messageError').hidden = true;
  api.chatUnsubscribe(messageChannel);
  messagesLoading = true;
  // Subscribe before fetching and deduplicate by row ID to close the initial-load gap.
  messageChannel = api.chatSubscribeMessages(group.id, row => {
    if (ticket !== viewVersion || row.group_id !== currentGroup?.id) return;
    loadedMessages.set(row.id, row);
    if (!messagesLoading) renderMessages();
  });
  try {
    const [messages, roster] = await Promise.all([api.chatFetchMessages(group.id), api.chatFetchRoster(currentUser)]);
    if (ticket !== viewVersion) return;
    messages.forEach(message => loadedMessages.set(message.id, message));
    el('loadOlder').hidden = messages.length < 100;
    el('invitePlayerSelect').innerHTML = '<option value="">Invite a player…</option>' + roster.filter(name => !group.memberNames?.includes(name)).map(name => `<option value="${esc(name)}">${esc(name)}</option>`).join('');
    messagesLoading = false; renderMessages(true);
  } catch (error) {
    if (ticket !== viewVersion) return;
    messagesLoading = false; renderMessages();
    showError(el('messageError'), errorMessage(error, 'Could not load this conversation. Open the group again to retry.'));
  }
}
function orderedMessages() { return [...loadedMessages.values()].sort((a,b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)); }
function renderMessages(forceScroll = false) {
  const box = el('messages');
  const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 100;
  const messages = orderedMessages();
  box.innerHTML = '';
  if (!messages.length) { box.innerHTML = '<div class="empty-inline"><h3>First word is yours</h3><p>Share a result or get the next match going.</p></div>'; return; }
  let day = '';
  const fragment = document.createDocumentFragment();
  for (const message of messages) {
    const date = new Date(message.created_at), label = date.toLocaleDateString(undefined, { day:'numeric', month:'short', year:'numeric' });
    if (day !== label) { const sep = document.createElement('div'); sep.className = 'day-sep'; sep.textContent = label; fragment.append(sep); day = label; }
    const mine = message.author === currentUser;
    const row = document.createElement('div'); row.className = 'msg ' + (mine ? 'me' : 'them'); row.dataset.messageId = message.id;
    row.innerHTML = `${mine ? '' : `<span class="sender">${esc(message.author)}</span>`}<div class="bubble" dir="auto">${esc(message.body)}</div><time class="meta" datetime="${esc(message.created_at)}">${date.toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'})}${mine ? ' · Sent' : ''}</time>`;
    fragment.append(row);
  }
  box.append(fragment);
  if (nearBottom || forceScroll) box.scrollTop = box.scrollHeight;
}
async function sendMessage(event) {
  event.preventDefault();
  const body = el('messageInput').value.trim();
  const groupId = currentGroup?.id, author = currentUser, ticket = viewVersion;
  if (!body || !groupId || !author) return;
  if (!messageDraft || messageDraft.body !== body || messageDraft.groupId !== groupId) messageDraft = { id: crypto.randomUUID(), body, groupId };
  const draft = messageDraft;
  return withBusy('chat-send', el('sendBtn'), async () => {
    el('messageError').hidden = true;
    try {
      const message = await api.chatSendMessage(groupId, author, body, draft.id);
      if (ticket !== viewVersion) return;
      loadedMessages.set(message.id, message); renderMessages(true);
      if (el('messageInput').value.trim() === body) el('messageInput').value = '';
      messageDraft = null;
    } catch (error) { if (ticket === viewVersion) showError(el('messageError'), errorMessage(error, 'Message not confirmed. Your text is kept; send again to retry safely.')); }
  }, '…');
}
function renderInvites() {
  el('invitesList').innerHTML = '';
  el('inviteBadge').textContent = invitations.length; el('inviteBadge').hidden = !invitations.length;
  el('invitesEmpty').hidden = !!invitations.length;
  for (const invitation of invitations) {
    const card = document.createElement('article'); card.className = 'invite-card';
    // A pending invite does not grant access to private group metadata under RLS.
    const group = invitation.chat_groups;
    card.innerHTML = `<div class="avatar group-avatar">${esc(group?.emoji || '✉')}</div><div class="invite-info"><h3>${esc(group?.name || 'Private league group')}</h3><p>Invited by ${esc(invitation.invited_by)}</p></div><div class="invite-actions"><button type="button" class="btn btn-accept">Accept</button><button type="button" class="btn btn-reject">Decline</button></div>`;
    for (const [selector, accepted] of [['.btn-accept', true], ['.btn-reject', false]]) {
      card.querySelector(selector).addEventListener('click', event => withBusy('invitation-' + invitation.id, event.currentTarget, async () => {
        await api.chatRespondInvite(invitation.id, accepted); await refreshAll();
        toast(accepted ? 'Invitation accepted. Your group is ready.' : 'Invitation declined.');
      }));
    }
    el('invitesList').append(card);
  }
}
function applyTheme(theme) {
  const safe = theme === 'light' ? 'light' : 'dark';
  document.documentElement.dataset.theme = safe;
  el('themeToggle').textContent = safe === 'dark' ? '☼' : '☾';
  el('themeToggle').setAttribute('aria-label', safe === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
  try { localStorage.setItem('circle-theme', safe); } catch { /* Optional preference. */ }
}

el('loginForm').addEventListener('submit', handleLogin);
el('retryLogin').addEventListener('click', populateLoginPlayers);
el('logoutBtn').addEventListener('click', handleLogout);
el('groupSearch').addEventListener('input', renderGroups);
el('refreshChats').addEventListener('click', refreshAll);
el('backToGroups').addEventListener('click', () => showView('groups'));
el('composer').addEventListener('submit', sendMessage);
el('themeToggle').addEventListener('click', () => applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => { showView(button.dataset.view); refreshAll(); }));
el('createGroupBtn').addEventListener('click', () => { el('groupError').hidden = true; openDialog('createGroupModal', () => { if (!isBusy('create-group')) closeDialog('createGroupModal'); }); });
el('cancelCreateGroup').addEventListener('click', () => { if (!isBusy('create-group')) closeDialog('createGroupModal'); });
el('createGroupForm').addEventListener('submit', event => {
  event.preventDefault();
  const name = el('newGroupName').value.trim();
  if (!name || !currentUser) return;
  const player = currentUser;
  withBusy('create-group', el('saveGroupButton'), async () => {
    try {
      const group = await api.chatCreateGroup(name, el('newGroupDesc').value.trim(), el('newGroupEmoji').value.trim() || '⚽', groups.length % 6, currentUser, groupDraftId ||= crypto.randomUUID());
      if (currentUser !== player) return;
      groupDraftId = null; closeDialog('createGroupModal'); el('createGroupForm').reset();
      await refreshAll(); await openChat(groups.find(item => item.id === group.id) || { ...group, members:1, memberNames:[currentUser] });
      toast('Group created.');
    } catch (error) { showError(el('groupError'), errorMessage(error, 'Could not create this group. Please try again.')); }
  });
});
el('sendInviteBtn').addEventListener('click', () => {
  const player = el('invitePlayerSelect').value, group = currentGroup;
  if (!player || !group) return;
  withBusy('send-invitation', el('sendInviteBtn'), async () => {
    await api.chatInvitePlayer(group.id, player, currentUser);
    if (currentGroup?.id === group.id) el('invitePlayerSelect').value = '';
    toast(`Invitation sent to ${player}.`);
  });
});
el('loadOlder').addEventListener('click', () => withBusy('load-older', el('loadOlder'), async () => {
  const ticket = viewVersion, groupId = currentGroup?.id;
  if (!groupId) return;
  const messages = await api.chatFetchMessages(groupId, orderedMessages()[0]);
  if (ticket !== viewVersion) return;
  const box = el('messages'), oldHeight = box.scrollHeight, oldTop = box.scrollTop;
  messages.forEach(message => loadedMessages.set(message.id, message)); renderMessages();
  box.scrollTop = oldTop + box.scrollHeight - oldHeight; el('loadOlder').hidden = messages.length < 100;
}, 'Loading…'));
setupConnectivity(refreshAll);
window.addEventListener('pagehide', () => { api.chatUnsubscribe(messageChannel); api.chatUnsubscribe(inviteChannel); });

async function init() {
  let theme = 'dark'; try { theme = localStorage.getItem('circle-theme') || 'dark'; } catch { /* Optional preference. */ }
  applyTheme(theme);
  if (!api.chatClient()) { showLogin(); showError(el('loginError'), 'League Chat is temporarily unavailable. Please try again shortly.'); el('loginButton').disabled = true; return; }
  const [, restored] = await Promise.allSettled([populateLoginPlayers(), window.EFLAuth.restore(api.chatClient())]);
  if (restored.status === 'fulfilled' && restored.value) { currentUser = restored.value.name; await enterApp(); }
  else showLogin();
  const unsubscribe = window.EFLAuth.subscribe(api.chatClient(), async profile => {
    if (!profile) { clearSession(); return; }
    if (profile.name !== currentUser && !signingIn) { clearSession(); currentUser = profile.name; await enterApp(); }
  });
  window.addEventListener('pagehide', unsubscribe, { once: true });
}
init().catch(() => { showLogin(); showError(el('loginError'), 'Could not open chat. Please refresh.'); });
