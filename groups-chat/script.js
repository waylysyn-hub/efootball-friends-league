// ---------- Mock data ----------
const palettes = [
  ["#6366f1", "#8b5cf6"],
  ["#06b6d4", "#3b82f6"],
  ["#f43f5e", "#fb7185"],
  ["#22c55e", "#10b981"],
  ["#f59e0b", "#f97316"],
  ["#a855f7", "#ec4899"],
];

const groups = [
  {
    id: "g1",
    name: "Design Crew",
    emoji: "🎨",
    members: 18,
    desc: "Pixel pushers sharing mockups, fonts and Figma chaos.",
    palette: 0,
  },
  {
    id: "g2",
    name: "Weekend Hikers",
    emoji: "🥾",
    members: 42,
    desc: "Trails, summits and questionable trail mix recipes.",
    palette: 3,
  },
  {
    id: "g3",
    name: "Code & Coffee",
    emoji: "☕",
    members: 27,
    desc: "Dev talk, shipping updates and late-night debugging.",
    palette: 1,
  },
  {
    id: "g4",
    name: "Foodies United",
    emoji: "🍜",
    members: 63,
    desc: "Recipes, restaurant finds and aggressively good photos.",
    palette: 4,
  },
  {
    id: "g5",
    name: "Game Night",
    emoji: "🎮",
    members: 31,
    desc: "Co-op sessions, tier lists and friendly trash talk.",
    palette: 5,
  },
  {
    id: "g6",
    name: "Book Club",
    emoji: "📚",
    members: 14,
    desc: "Monthly reads, hot takes and zero spoilers (mostly).",
    palette: 2,
  },
];

const messagesByGroup = {
  g1: [
    { sender: "Maya", text: "Dropped the new landing mockups 👀", me: false, time: "09:12" },
    { sender: "You", text: "Loving the gradient direction!", me: true, time: "09:14" },
    { sender: "Leo", text: "Can we try a lighter hero section?", me: false, time: "09:16" },
    { sender: "You", text: "On it — pushing a variant in 10.", me: true, time: "09:17" },
  ],
  g2: [
    { sender: "Sam", text: "Trail conditions look great for Saturday ⛰️", me: false, time: "18:02" },
    { sender: "You", text: "I'm in! What time are we starting?", me: true, time: "18:05" },
    { sender: "Priya", text: "7am at the north trailhead.", me: false, time: "18:06" },
  ],
  g3: [
    { sender: "Devon", text: "Shipped the auth refactor today 🚀", me: false, time: "11:40" },
    { sender: "You", text: "Huge. Tests green?", me: true, time: "11:41" },
    { sender: "Devon", text: "All passing ✅", me: false, time: "11:42" },
  ],
  g4: [
    { sender: "Nina", text: "Found a ramen spot that changed my life 🍜", me: false, time: "20:15" },
    { sender: "You", text: "Sending pin or it didn't happen", me: true, time: "20:16" },
  ],
  g5: [
    { sender: "Jay", text: "Squad up at 9? 🎮", me: false, time: "21:00" },
    { sender: "You", text: "Give me 15 to finish dinner", me: true, time: "21:01" },
  ],
  g6: [
    { sender: "Ada", text: "Chapter 7 destroyed me emotionally 📖", me: false, time: "15:30" },
    { sender: "You", text: "Don't say a word, I'm only on 4!", me: true, time: "15:33" },
  ],
};

let invitations = [
  { id: "i1", group: "Startup Founders", from: "Olivia R.", emoji: "🚀", palette: 1 },
  { id: "i2", group: "Vinyl Collectors", from: "Marcus T.", emoji: "🎵", palette: 5 },
  { id: "i3", group: "Morning Runners", from: "Hana K.", emoji: "🏃", palette: 3 },
];

// ---------- State / elements ----------
let currentGroup = null;
const el = (id) => document.getElementById(id);
const initials = (name) =>
  name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

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
el("backToGroups").addEventListener("click", () => showView("groups"));

// ---------- Render groups ----------
function renderGroups(filter = "") {
  const grid = el("groupsGrid");
  const q = filter.trim().toLowerCase();
  const list = groups.filter((g) => g.name.toLowerCase().includes(q));
  grid.innerHTML = "";

  if (!list.length) {
    grid.innerHTML = `<p class="muted">No groups match “${filter}”.</p>`;
    return;
  }

  list.forEach((g) => {
    const [c1, c2] = palettes[g.palette];
    const stack = Array.from({ length: Math.min(4, g.members) })
      .map((_, i) => {
        const [a, b] = palettes[(g.palette + i) % palettes.length];
        return `<span class="mini" style="background:linear-gradient(135deg,${a},${b})">${String.fromCharCode(
          65 + ((g.name.charCodeAt(0) + i) % 26)
        )}</span>`;
      })
      .join("");

    const card = document.createElement("div");
    card.className = "group-card";
    card.innerHTML = `
      <div class="group-top">
        <div class="avatar group-avatar" style="--c1:${c1};--c2:${c2}">${g.emoji}</div>
        <div>
          <div class="group-name">${g.name}</div>
          <div class="members">👥 ${g.members} members</div>
        </div>
      </div>
      <p class="group-desc">${g.desc}</p>
      <div class="avatars-stack">${stack}</div>
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

// ---------- Chat ----------
function openChat(group) {
  currentGroup = group;
  const [c1, c2] = palettes[group.palette];
  const avatar = el("chatAvatar");
  avatar.textContent = group.emoji;
  avatar.style.setProperty("--c1", c1);
  avatar.style.setProperty("--c2", c2);
  el("chatGroupName").textContent = group.name;
  el("chatGroupMeta").textContent = `${group.members} members · ${Math.max(
    1,
    Math.round(group.members / 4)
  )} online`;
  renderMessages();
  showView("chat");
  el("messageInput").focus();
}

function renderMessages() {
  const box = el("messages");
  const msgs = messagesByGroup[currentGroup.id] || [];
  box.innerHTML = '<div class="day-sep">Today</div>';
  msgs.forEach((m) => box.appendChild(buildMessage(m)));
  box.scrollTop = box.scrollHeight;
}

function buildMessage(m) {
  const wrap = document.createElement("div");
  wrap.className = `msg ${m.me ? "me" : "them"}`;
  wrap.innerHTML = `
    ${m.me ? "" : `<span class="sender">${m.sender}</span>`}
    <div class="bubble">${escapeHtml(m.text)}</div>
    <span class="meta">${m.time}</span>
  `;
  return wrap;
}

function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}

el("composer").addEventListener("submit", (e) => {
  e.preventDefault();
  const input = el("messageInput");
  const text = input.value.trim();
  if (!text || !currentGroup) return;

  const now = new Date();
  const time = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const msg = { sender: "You", text, me: true, time };
  messagesByGroup[currentGroup.id].push(msg);

  const box = el("messages");
  box.appendChild(buildMessage(msg));
  box.scrollTop = box.scrollHeight;
  input.value = "";
  input.focus();

  maybeAutoReply();
});

function maybeAutoReply() {
  const replies = [
    "Nice one 👍",
    "Haha totally",
    "Let's do it!",
    "Good point.",
    "Be right back 🙂",
    "Agreed 💯",
  ];
  const senders = ["Maya", "Leo", "Sam", "Devon", "Nina", "Jay", "Ada"];
  const groupId = currentGroup.id;

  setTimeout(() => {
    if (!currentGroup || currentGroup.id !== groupId) return;
    const reply = {
      sender: senders[Math.floor(Math.random() * senders.length)],
      text: replies[Math.floor(Math.random() * replies.length)],
      me: false,
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };
    messagesByGroup[groupId].push(reply);
    const box = el("messages");
    box.appendChild(buildMessage(reply));
    box.scrollTop = box.scrollHeight;
  }, 1100 + Math.random() * 900);
}

// ---------- Invitations ----------
function renderInvites() {
  const list = el("invitesList");
  list.innerHTML = "";

  const badge = el("inviteBadge");
  badge.textContent = invitations.length;
  badge.dataset.empty = invitations.length === 0;

  el("invitesEmpty").hidden = invitations.length !== 0;

  invitations.forEach((inv) => {
    const [c1, c2] = palettes[inv.palette];
    const card = document.createElement("div");
    card.className = "invite-card";
    card.innerHTML = `
      <div class="avatar group-avatar" style="--c1:${c1};--c2:${c2}">${inv.emoji}</div>
      <div class="invite-info">
        <div class="group-name">${inv.group}</div>
        <div class="from">Invited by ${inv.from}</div>
      </div>
      <div class="invite-actions">
        <button class="btn btn-accept">Accept</button>
        <button class="btn btn-reject">Reject</button>
      </div>
    `;
    card
      .querySelector(".btn-accept")
      .addEventListener("click", () => resolveInvite(inv, card, true));
    card
      .querySelector(".btn-reject")
      .addEventListener("click", () => resolveInvite(inv, card, false));
    list.appendChild(card);
  });
}

function resolveInvite(inv, card, accepted) {
  card.classList.add("leaving");
  if (accepted) {
    groups.unshift({
      id: inv.id,
      name: inv.group,
      emoji: inv.emoji,
      members: Math.floor(20 + Math.random() * 50),
      desc: "Freshly joined — say hi to your new circle!",
      palette: inv.palette,
    });
    messagesByGroup[inv.id] = [
      {
        sender: inv.from.split(" ")[0],
        text: `Welcome to ${inv.group}! 🎉`,
        me: false,
        time: "now",
      },
    ];
  }
  setTimeout(() => {
    invitations = invitations.filter((x) => x.id !== inv.id);
    renderInvites();
    renderGroups(el("groupSearch").value);
  }, 320);

  showToast(accepted ? `Joined “${inv.group}” 🎉` : `Declined “${inv.group}”`);
}

// ---------- Toast ----------
let toastTimer;
function showToast(text) {
  const t = el("toast");
  t.textContent = text;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2400);
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
  const next =
    document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
  applyTheme(next);
});

// ---------- Init ----------
(function init() {
  let saved = "light";
  try {
    saved = localStorage.getItem("circle-theme") || "light";
  } catch (_) {}
  applyTheme(saved);
  renderGroups();
  renderInvites();
})();
