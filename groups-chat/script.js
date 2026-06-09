// ---------- Theme palettes (visual only) ----------
const palettes = [
  ["#6366f1", "#8b5cf6"],
  ["#06b6d4", "#3b82f6"],
  ["#f43f5e", "#fb7185"],
  ["#22c55e", "#10b981"],
  ["#f59e0b", "#f97316"],
  ["#a855f7", "#ec4899"],
];

// ---------- State ----------
let currentUser = null;
let groups = [];
let invitations = [];
let currentGroup = null;
let messageChannel = null;

const el = (id) => document.getElementById(id);
const initials = (name) =>
  name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

function formatMsgTime(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDayLabel(iso) {
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return "Today";
  return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}

function showToast(text) {
  const t = el("toast");
  t.textContent = text;
  t.classList.add("show");
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => t.classList.remove("show"), 2400);
}

function showError(msg) {
  const err = el("loginError");
  err.textContent = msg;
  err.hidden = false;
}

// ---------- Auth ----------
async function handleLogin() {
  const username = el("loginUsername").value;
  const password = el("loginPassword").value;
  el("loginError").hidden = true;

  if (!username || !password) {
    showError("Select your account and enter your password.");
    return;
  }

  try {
    const name = await chatLogin(username, password);
    if (!name) {
      showError("Invalid username or password.");
      return;
    }
    currentUser = name;
    localStorage.setItem("efl_user", name);
    await enterApp();
  } catch (e) {
    showError("Could not connect to Supabase.");
  }
}

async function handleLogout() {
  currentUser = null;
  localStorage.removeItem("efl_user");
  chatUnsubscribe(messageChannel);
  messageChannel = null;
  el("loginScreen").classList.remove("hidden");
  el("appRoot").classList.add("hidden");
}

async function enterApp() {
  el("loginScreen").classList.add("hidden");
  el("appRoot").classList.remove("hidden");
  updateMeSidebar();
  await refreshAll();
}

function updateMeSidebar() {
  const [c1, c2] = palettes[0];
  const avatar = el("meAvatar");
  avatar.textContent = initials(currentUser);
  avatar.style.setProperty("--c1", c1);
  avatar.style.setProperty("--c2", c2);
  el("meName").textContent = currentUser;
}

async function populateLoginPlayers() {
  const select = el("loginUsername");
  try {
    const players = await chatFetchPlayers();
    select.innerHTML = '<option value="">— SELECT PLAYER —</option>';
    players.forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p.name;
      opt.textContent = p.name;
      select.appendChild(opt);
    });
  } catch (_) {
    showError("Could not load players from Supabase.");
  }
}

// ---------- Navigation ----------
function showView(name) {
  document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
  el(`view-${name}`).classList.add("active");
  document.querySelectorAll(".nav-item[data-view]").forEach((n) => {
    n.classList.toggle("active", n.dataset.view === name);
  });
}

document.querySelectorAll(".nav-item[data-view]").forEach((btn) => {
  btn.addEventListener("click", () => showView(btn.dataset.view));
});
el("backToGroups").addEventListener("click", () => {
  chatUnsubscribe(messageChannel);
  messageChannel = null;
  currentGroup = null;
  el("chatInviteBar").classList.add("hidden");
  showView("groups");
});

async function populateInviteSelect() {
  const select = el("invitePlayerSelect");
  try {
    const roster = await chatFetchRoster(currentUser);
    select.innerHTML = '<option value="">Invite player…</option>';
    roster.forEach((name) => {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      select.appendChild(opt);
    });
  } catch (_) {
    select.innerHTML = '<option value="">Could not load roster</option>';
  }
}

el("sendInviteBtn").addEventListener("click", async () => {
  const player = el("invitePlayerSelect").value;
  if (!player || !currentGroup) return;
  try {
    await chatInvitePlayer(currentGroup.id, player, currentUser);
    showToast(`Invited ${player}`);
    el("invitePlayerSelect").value = "";
  } catch (_) {
    showToast("Could not send invitation.");
  }
});

// ---------- Data refresh ----------
async function refreshAll() {
  try {
    [groups, invitations] = await Promise.all([
      chatFetchGroups(currentUser),
      chatFetchInvitations(currentUser),
    ]);
    renderGroups(el("groupSearch").value);
    renderInvites();
  } catch (e) {
    showToast("Failed to load chat data.");
  }
}

// ---------- Groups ----------
function renderGroups(filter = "") {
  const grid = el("groupsGrid");
  const q = filter.trim().toLowerCase();
  const list = groups.filter((g) => g.name.toLowerCase().includes(q));
  grid.innerHTML = "";

  if (!list.length) {
    grid.innerHTML = `<div class="empty-inline"><p class="muted">${q ? `No groups match “${filter}”.` : "No groups yet. Create one to start chatting."}</p></div>`;
    return;
  }

  list.forEach((g) => {
    const [c1, c2] = palettes[g.palette_index % palettes.length];
    const card = document.createElement("div");
    card.className = "group-card";
    card.innerHTML = `
      <div class="group-top">
        <div class="avatar group-avatar" style="--c1:${c1};--c2:${c2}">${g.emoji}</div>
        <div>
          <div class="group-name">${escapeHtml(g.name)}</div>
          <div class="members">👥 ${g.members} members</div>
        </div>
      </div>
      <p class="group-desc">${escapeHtml(g.description || "")}</p>
      <button class="open-btn">Open chat</button>
    `;
    card.querySelector(".open-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      openChat(g);
    });
    card.addEventListener("click", () => openChat(g));
    grid.appendChild(card);
  });
}

el("groupSearch").addEventListener("input", (e) => renderGroups(e.target.value));

el("createGroupBtn").addEventListener("click", () => {
  el("createGroupModal").classList.remove("hidden");
  el("newGroupName").focus();
});

el("createGroupForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = el("newGroupName").value.trim();
  const desc = el("newGroupDesc").value.trim();
  const emoji = el("newGroupEmoji").value.trim() || "⚽";
  if (!name) return;

  try {
    const paletteIndex = groups.length % palettes.length;
    const group = await chatCreateGroup(name, desc, emoji, paletteIndex, currentUser);
    el("createGroupModal").classList.add("hidden");
    el("createGroupForm").reset();
    groups.unshift({ ...group, members: 1 });
    renderGroups(el("groupSearch").value);
    openChat({ ...group, members: 1 });
    showToast(`Created “${name}”`);
  } catch (_) {
    showToast("Could not create group.");
  }
});

el("cancelCreateGroup").addEventListener("click", () => {
  el("createGroupModal").classList.add("hidden");
});

// ---------- Chat ----------
async function openChat(group) {
  currentGroup = group;
  const [c1, c2] = palettes[group.palette_index % palettes.length];
  const avatar = el("chatAvatar");
  avatar.textContent = group.emoji;
  avatar.style.setProperty("--c1", c1);
  avatar.style.setProperty("--c2", c2);
  el("chatGroupName").textContent = group.name;
  el("chatGroupMeta").textContent = `${group.members} members`;
  await populateInviteSelect();
  el("chatInviteBar").classList.remove("hidden");

  chatUnsubscribe(messageChannel);
  await renderMessages();

  messageChannel = chatSubscribeMessages(group.id, (row) => {
    if (row.author === currentUser) return;
    appendMessage(row, false);
  });

  showView("chat");
  el("messageInput").focus();
}

async function renderMessages() {
  const box = el("messages");
  box.innerHTML = '<p class="muted chat-loading">Loading messages…</p>';

  try {
    const msgs = await chatFetchMessages(currentGroup.id);
    box.innerHTML = "";
    let lastDay = "";
    msgs.forEach((m) => {
      const day = formatDayLabel(m.created_at);
      if (day !== lastDay) {
        lastDay = day;
        const sep = document.createElement("div");
        sep.className = "day-sep";
        sep.textContent = day;
        box.appendChild(sep);
      }
      appendMessage(m, m.author === currentUser, false);
    });
    box.scrollTop = box.scrollHeight;
  } catch (_) {
    box.innerHTML = '<p class="muted">Could not load messages.</p>';
  }
}

function appendMessage(m, isMe, scroll = true) {
  const box = el("messages");
  const wrap = document.createElement("div");
  wrap.className = `msg ${isMe ? "me" : "them"}`;
  wrap.innerHTML = `
    ${isMe ? "" : `<span class="sender">${escapeHtml(m.author)}</span>`}
    <div class="bubble">${escapeHtml(m.body)}</div>
    <span class="meta">${formatMsgTime(m.created_at)}</span>
  `;
  box.appendChild(wrap);
  if (scroll) box.scrollTop = box.scrollHeight;
}

el("composer").addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = el("messageInput");
  const text = input.value.trim();
  if (!text || !currentGroup) return;

  input.value = "";
  input.disabled = true;

  const optimistic = {
    author: currentUser,
    body: text,
    created_at: new Date().toISOString(),
  };
  appendMessage(optimistic, true);

  try {
    await chatSendMessage(currentGroup.id, currentUser, text);
  } catch (_) {
    showToast("Message failed to send.");
  } finally {
    input.disabled = false;
    input.focus();
  }
});

// ---------- Invitations ----------
function renderInvites() {
  const list = el("invitesList");
  list.innerHTML = "";

  const badge = el("inviteBadge");
  badge.textContent = invitations.length;
  badge.dataset.empty = invitations.length === 0;
  el("invitesEmpty").hidden = invitations.length !== 0;

  invitations.forEach((inv) => {
    const g = inv.chat_groups || {};
    const [c1, c2] = palettes[(g.palette_index || 0) % palettes.length];
    const card = document.createElement("div");
    card.className = "invite-card";
    card.innerHTML = `
      <div class="avatar group-avatar" style="--c1:${c1};--c2:${c2}">${g.emoji || "⚽"}</div>
      <div class="invite-info">
        <div class="group-name">${escapeHtml(g.name || "Group")}</div>
        <div class="from">Invited by ${escapeHtml(inv.invited_by)}</div>
      </div>
      <div class="invite-actions">
        <button class="btn btn-accept">Accept</button>
        <button class="btn btn-reject">Reject</button>
      </div>
    `;
    card.querySelector(".btn-accept").addEventListener("click", () => resolveInvite(inv, card, true));
    card.querySelector(".btn-reject").addEventListener("click", () => resolveInvite(inv, card, false));
    list.appendChild(card);
  });
}

async function resolveInvite(inv, card, accepted) {
  card.classList.add("leaving");
  try {
    await chatRespondInvite(inv.id, accepted);
    setTimeout(async () => {
      await refreshAll();
    }, 320);
    showToast(accepted ? `Joined “${inv.chat_groups?.name || "group"}” 🎉` : "Invitation declined");
  } catch (_) {
    card.classList.remove("leaving");
    showToast("Could not update invitation.");
  }
}

// ---------- Theme ----------
const themeToggle = el("themeToggle");
function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  themeToggle.querySelector(".theme-icon").textContent = theme === "dark" ? "☀️" : "🌙";
  try {
    localStorage.setItem("circle-theme", theme);
  } catch (_) {}
}
themeToggle.addEventListener("click", () => {
  const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
  applyTheme(next);
});

// ---------- Boot ----------
(async function init() {
  let savedTheme = "light";
  try {
    savedTheme = localStorage.getItem("circle-theme") || "light";
  } catch (_) {}
  applyTheme(savedTheme);

  if (!chatClient()) {
    showError("Supabase is not configured. Edit supabase-config.js.");
    return;
  }

  await populateLoginPlayers();

  const savedUser = localStorage.getItem("efl_user");
  if (savedUser) {
    el("loginUsername").value = savedUser;
    // Auto-enter if session exists — password still required on fresh device
  }

  el("loginScreen").classList.remove("hidden");
})();

el("logoutBtn").addEventListener("click", handleLogout);
