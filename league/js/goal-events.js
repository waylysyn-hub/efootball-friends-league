import { state } from './state.js';
import { esc, showToast } from './ui.js';
import { updateMatchPreview } from './matches.js';
import { canManageSquad, getSquad, openSquadPlayer, POSITIONS } from './squads.js';

export function getMatchGoalEvents(matchId) {
  return state.db.goalEvents.filter(e => e.matchId === matchId)
    .sort((a, b) => (a.minute - b.minute) || (a.sortOrder - b.sortOrder));
}
export function getMainMatchPlayers(containerId) {
  const prefix = containerId === 'editGoalEventsList' ? 'edit' : 'match';
  return { p1: document.getElementById(prefix + 'Player1')?.value || '', p2: document.getElementById(prefix + 'Player2')?.value || '' };
}
export function getMatchScoreFromForm(containerId) {
  const prefix = containerId === 'editGoalEventsList' ? 'edit' : 'match';
  return { g1: Number(document.getElementById(prefix + 'Goals1')?.value) || 0, g2: Number(document.getElementById(prefix + 'Goals2')?.value) || 0 };
}
export function goalEventsSummaryId(containerId) { return containerId === 'goalEventsList' ? 'goalEventsSummary' : 'editGoalEventsSummary'; }
function editingMatchId(containerId) { return containerId === 'editGoalEventsList' ? document.getElementById('editMatchId')?.value : null; }

export function ownerOptionsHTML(p1, p2, selected) {
  return '<option value="">اختر صاحب الفريق</option>' + [...new Set([p1, p2])].filter(Boolean)
    .map(name => `<option value="${esc(name)}"${name === selected ? ' selected' : ''}>${esc(name)}</option>`).join('');
}
function previousName(matchId, owner, field, name) {
  return !!matchId && !!name && getMatchGoalEvents(matchId).some(e => e.owner === owner && e[field] === name);
}
export function squadOptionsHTML(containerId, owner, field, selected = '', exclude = '') {
  const members = getSquad(owner).filter(p => p.name !== exclude);
  const placeholder = field === 'assist' ? 'بدون أسيست' : 'اختر المسجّل من التشكيلة';
  let html = `<option value="">${placeholder}</option>` + members.map(p =>
    `<option value="${esc(p.name)}"${p.name === selected ? ' selected' : ''}>${esc(p.name)} · ${POSITIONS[p.position] || ''}</option>`).join('');
  // Keep only a previously saved selection when editing a historical match.
  // New goals cannot invent names outside the active squad.
  if (selected && selected !== exclude && !members.some(p => p.name === selected) && previousName(editingMatchId(containerId), owner, field, selected)) {
    html += `<option value="${esc(selected)}" selected>${esc(selected)} · مسجّل سابقًا</option>`;
  }
  return html;
}
export function goalEventRowHTML(e, idx, containerId, p1, p2) {
  const owner = [p1, p2].includes(e.owner) ? e.owner : '';
  const scorer = owner ? e.scorer || '' : '', assist = owner ? e.assist || '' : '';
  const key = `${containerId}-${idx}`;
  return `<article class="ge-row" data-idx="${idx}">
    <div class="ge-card-header"><span class="ge-number">هدف ${idx + 1}</span><button type="button" class="btn-sm delete ge-remove" onclick="League.removeGoalEventRow('${containerId}', ${idx})" aria-label="حذف الهدف ${idx + 1}">✕</button></div>
    <div class="ge-fields">
      <div class="ge-field"><label for="${key}-owner">صاحب الفريق</label><select id="${key}-owner" class="ge-owner" onchange="League.onGoalOwnerChange('${containerId}', ${idx})">${ownerOptionsHTML(p1, p2, owner)}</select></div>
      <div class="ge-field"><label for="${key}-scorer">⚽ المسجّل</label><select id="${key}-scorer" class="ge-scorer" onchange="League.onGoalScorerChange('${containerId}', ${idx})">${squadOptionsHTML(containerId, owner, 'scorer', scorer)}</select></div>
      <div class="ge-field"><label for="${key}-assist">🎯 الأسيست</label><select id="${key}-assist" class="ge-assist" onchange="League.updateGoalEventsUI('${containerId}')">${squadOptionsHTML(containerId, owner, 'assist', assist, scorer)}</select></div>
      <div class="ge-field"><label for="${key}-minute">الدقيقة <span>(اختياري)</span></label><input id="${key}-minute" type="number" class="ge-minute" inputmode="numeric" step="1" min="0" max="120" placeholder="0–120" value="${Number.isFinite(e.minute) && e.minute !== 0 ? e.minute : ''}" oninput="League.updateGoalEventsUI('${containerId}')"></div>
    </div>
    <div class="ge-squad-note"></div>
    <button class="btn-sm ge-manage" type="button" onclick="League.openGoalSquad('${containerId}', ${idx})">+ إضافة لاعب للتشكيلة</button>
  </article>`;
}
export function collectGoalEventsFromForm(containerId) {
  return [...(document.getElementById(containerId)?.querySelectorAll('.ge-row') || [])].map((row, i) => ({
    owner: row.querySelector('.ge-owner')?.value || '', scorer: row.querySelector('.ge-scorer')?.value || '',
    assist: row.querySelector('.ge-assist')?.value || '', minute: Number(row.querySelector('.ge-minute')?.value), sortOrder: i,
  }));
}
export function renderGoalEventsForm(containerId, events = []) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const { p1, p2 } = getMainMatchPlayers(containerId);
  el.innerHTML = events.length ? events.map((e, i) => goalEventRowHTML(e, i, containerId, p1, p2)).join('')
    : '<div class="empty-state ge-empty">كل هدف له قصة. اضغط «إضافة هدف» واختر لاعبيه من التشكيلة.</div>';
  updateGoalEventsUI(containerId);
}
export function onGoalOwnerChange(containerId, idx) {
  const row = document.getElementById(containerId)?.querySelectorAll('.ge-row')[idx];
  if (!row) return;
  const owner = row.querySelector('.ge-owner').value;
  row.querySelector('.ge-scorer').innerHTML = squadOptionsHTML(containerId, owner, 'scorer');
  row.querySelector('.ge-assist').innerHTML = squadOptionsHTML(containerId, owner, 'assist');
  updateGoalEventsUI(containerId);
}
export function onGoalScorerChange(containerId, idx) {
  const row = document.getElementById(containerId)?.querySelectorAll('.ge-row')[idx];
  if (!row) return;
  const assist = row.querySelector('.ge-assist');
  assist.innerHTML = squadOptionsHTML(containerId, row.querySelector('.ge-owner').value, 'assist', assist.value, row.querySelector('.ge-scorer').value);
  updateGoalEventsUI(containerId);
}
export function openGoalSquad(containerId, idx) {
  const owner = document.getElementById(containerId)?.querySelectorAll('.ge-row')[idx]?.querySelector('.ge-owner').value;
  if (owner) openSquadPlayer(owner);
}
export function refreshGoalOwnerOptions(containerId) {
  const { p1, p2 } = getMainMatchPlayers(containerId);
  document.querySelectorAll(`#${containerId} .ge-owner`).forEach((select, idx) => {
    const previous = select.value;
    select.innerHTML = ownerOptionsHTML(p1, p2, previous);
    if (!previous || ![p1, p2].includes(previous)) onGoalOwnerChange(containerId, idx);
  });
  updateGoalEventsUI(containerId);
}
export function refreshGoalSquadOptions() {
  for (const id of ['goalEventsList', 'editGoalEventsList']) {
    document.querySelectorAll(`#${id} .ge-row`).forEach(row => {
      const owner = row.querySelector('.ge-owner').value;
      const scorer = row.querySelector('.ge-scorer'), assist = row.querySelector('.ge-assist');
      scorer.innerHTML = squadOptionsHTML(id, owner, 'scorer', scorer.value);
      assist.innerHTML = squadOptionsHTML(id, owner, 'assist', assist.value, scorer.value);
    });
    updateGoalEventsUI(id);
  }
}
export function addGoalEventRow(containerId) {
  const { p1, p2 } = getMainMatchPlayers(containerId);
  if (!p1 || !p2 || p1 === p2) return showToast('اختر لاعبين مختلفين للمباراة أولًا.', true);
  if (!state.squadsReady) return showToast('التشكيلات غير متاحة. حدّث الصفحة أو تواصل مع مدير الدوري.', true);
  const events = collectGoalEventsFromForm(containerId), { g1, g2 } = getMatchScoreFromForm(containerId);
  const { c1, c2 } = countGoalsByOwner(events, p1, p2);
  const owner = c1 < g1 ? p1 : c2 < g2 ? p2 : p1;
  events.push({ owner, scorer: '', assist: '', minute: 0 });
  renderGoalEventsForm(containerId, events);
  document.getElementById(containerId).querySelector('.ge-row:last-child .ge-scorer')?.focus();
}
export function removeGoalEventRow(containerId, idx) {
  const events = collectGoalEventsFromForm(containerId); events.splice(idx, 1);
  renderGoalEventsForm(containerId, events);
}
export function countGoalsByOwner(events, p1, p2) {
  return { c1: events.filter(e => e.owner === p1).length, c2: events.filter(e => e.owner === p2).length };
}
export function canKeepLegacyScore(matchId, p1, p2, g1, g2) {
  const match = state.db.matches.find(m => m.id === matchId);
  return !!match && !getMatchGoalEvents(matchId).length && match.player1 === p1 && match.player2 === p2 && match.goals1 === g1 && match.goals2 === g2;
}
export function validateGoalEvents(events, p1, p2, g1, g2, { requireSquad = false, matchId = null } = {}) {
  if (!events.length && (!requireSquad || canKeepLegacyScore(matchId, p1, p2, g1, g2))) return null;
  for (let i = 0; i < events.length; i++) {
    const e = events[i], label = `الهدف ${i + 1}: `;
    if (![p1, p2].includes(e.owner) || !e.owner) return label + 'اختر صاحب الفريق من طرفَي المباراة.';
    if (!e.scorer) return label + 'اختر المسجّل من تشكيلة ' + e.owner + '.';
    if (!Number.isInteger(e.minute) || e.minute < 0 || e.minute > 120) return label + 'الدقيقة يجب أن تكون عددًا صحيحًا بين 0 و120.';
    if (e.scorer.length > 100 || e.assist.length > 100) return label + 'اسم اللاعب يجب ألا يتجاوز 100 حرف.';
    if (e.assist && e.scorer.toLowerCase() === e.assist.toLowerCase()) return label + 'المسجّل لا يمكن أن يصنع الأسيست لنفسه. اختر زميلًا أو «بدون أسيست».';
    if (requireSquad) for (const field of ['scorer', 'assist']) {
      const name = e[field];
      if (name && !getSquad(e.owner).some(p => p.name === name) && !previousName(matchId, e.owner, field, name)) {
        return label + (field === 'scorer' ? 'المسجّل' : 'صانع الأسيست') + ' غير موجود في تشكيلة ' + e.owner + '. حدّث التشكيلة ثم أعد اختياره.';
      }
    }
  }
  const { c1, c2 } = countGoalsByOwner(events, p1, p2);
  if (c1 !== g1 || c2 !== g2) return `تفاصيل الأهداف لا تطابق النتيجة: ${p1} (${c1} من ${g1})، ${p2} (${c2} من ${g2}). أكمل الأهداف أو اضغط «احتساب النتيجة من الأهداف».`;
  return null;
}
export function goalEventsSummaryHTML(containerId, events) {
  const { p1, p2 } = getMainMatchPlayers(containerId), { g1, g2 } = getMatchScoreFromForm(containerId);
  if (!events.length && g1 + g2 > 0 && canKeepLegacyScore(editingMatchId(containerId), p1, p2, g1, g2)) return '<div class="ms-total-line">مباراة سابقة دون تفاصيل أهداف. يمكنك حفظ التعديلات مع إبقاء النتيجة كما هي.</div>';
  const { c1, c2 } = countGoalsByOwner(events, p1, p2);
  const ok = c1 === g1 && c2 === g2 && events.every(e => e.scorer);
  return `<div class="ms-total-line ${ok ? 'ok' : 'bad'}"><span>${ok ? '✓ الأهداف مكتملة' : 'أكمل تفاصيل الأهداف'}</span><strong dir="auto">${esc(p1 || 'الفريق الأول')} ${c1} / ${g1}</strong><strong dir="auto">${esc(p2 || 'الفريق الثاني')} ${c2} / ${g2}</strong></div>`;
}
export function updateGoalEventsUI(containerId) {
  const events = collectGoalEventsFromForm(containerId);
  const summary = document.getElementById(goalEventsSummaryId(containerId));
  if (summary) { summary.setAttribute('aria-live', 'polite'); summary.innerHTML = goalEventsSummaryHTML(containerId, events); }
  document.querySelectorAll(`#${containerId} .ge-row`).forEach((row, idx) => {
    const e = events[idx], members = getSquad(e.owner);
    const note = row.querySelector('.ge-squad-note');
    note.textContent = !e.owner ? 'اختر صاحب الفريق لعرض تشكيلته.' : !members.length ? `تشكيلة ${e.owner} فارغة. أضف لاعبي الفريق أولًا.` : `${members.length} لاعب متاح من تشكيلة ${e.owner}`;
    row.querySelector('.ge-manage').hidden = !e.owner || !canManageSquad(e.owner) || !state.squadsReady;
    row.querySelector('.ge-scorer').disabled = !e.owner || !state.squadsReady;
    row.querySelector('.ge-assist').disabled = !e.owner || !state.squadsReady;
  });
  const preview = document.getElementById(containerId === 'goalEventsList' ? 'matchAwardsPreview' : 'editMatchAwardsPreview');
  if (preview) preview.innerHTML = matchAwardsHTML(null, events.filter(e => e.scorer && e.owner)) || '<span class="text-dim">تظهر الجوائز بعد اختيار المسجّلين.</span>';
}
export function syncScoreFromGoalEvents(containerId) {
  const { p1, p2 } = getMainMatchPlayers(containerId);
  if (!p1 || !p2 || p1 === p2) return showToast('اختر لاعبين مختلفين للمباراة أولًا.', true);
  const events = collectGoalEventsFromForm(containerId), { c1, c2 } = countGoalsByOwner(events, p1, p2);
  if (events.some(e => ![p1, p2].includes(e.owner))) return showToast('اختر صاحب الفريق لكل هدف قبل احتساب النتيجة.', true);
  const prefix = containerId === 'editGoalEventsList' ? 'edit' : 'match';
  document.getElementById(prefix + 'Goals1').value = c1; document.getElementById(prefix + 'Goals2').value = c2;
  if (prefix === 'match') updateMatchPreview(); else updateGoalEventsUI(containerId);
  showToast('تم احتساب النتيجة من الأهداف.');
}

export function aggregateOwnerStatsFromEvents(matchId, events = getMatchGoalEvents(matchId)) {
  const byOwner = Object.create(null);
  events.forEach(e => {
    if (!byOwner[e.owner]) byOwner[e.owner] = { goals: 0, assists: 0 };
    byOwner[e.owner].goals++;
    if (e.assist) byOwner[e.owner].assists++;
  });
  return byOwner;
}

export function computeMatchAwards(matchId, events) {
  const byOwner = aggregateOwnerStatsFromEvents(matchId, events);
  const owners = Object.keys(byOwner);
  if (!owners.length) return [];
  const awards = [];
  const maxGoals = Math.max(...owners.map(o => byOwner[o].goals));
  const maxAssists = Math.max(...owners.map(o => byOwner[o].assists));
  const maxMvp = Math.max(...owners.map(o => byOwner[o].goals * 2 + byOwner[o].assists));

  if (maxGoals > 0) {
    owners.filter(o => byOwner[o].goals === maxGoals).forEach(o => {
      awards.push({ icon: '⚽', title: 'Match Top Scorer', player: o, detail: `${byOwner[o].goals} goal${byOwner[o].goals !== 1 ? 's' : ''}` });
    });
  }
  if (maxAssists > 0) {
    owners.filter(o => byOwner[o].assists === maxAssists).forEach(o => {
      awards.push({ icon: '🎯', title: 'Best Playmaker', player: o, detail: `${byOwner[o].assists} assist${byOwner[o].assists !== 1 ? 's' : ''}` });
    });
  }
  if (maxMvp > 0) {
    owners.filter(o => byOwner[o].goals * 2 + byOwner[o].assists === maxMvp).forEach(o => {
      awards.push({ icon: '👑', title: 'MVP', player: o, detail: `${byOwner[o].goals}G · ${byOwner[o].assists}A` });
    });
  }
  owners.filter(o => byOwner[o].goals >= 3).forEach(o => {
    awards.push({ icon: '🎩', title: 'Hat-trick', player: o, detail: `${byOwner[o].goals} goals` });
  });
  return awards;
}

export function matchAwardsHTML(matchId, events) {
  const awards = computeMatchAwards(matchId, events);
  if (!awards.length) return '';
  return `<div class="match-awards">${awards.map(a =>
    `<span class="match-award-chip" title="${esc(a.title)} — ${esc(a.detail)}">` +
    `${a.icon} <strong>${esc(a.player)}</strong> <span class="match-award-title">${esc(a.title)}</span></span>`
  ).join('')}</div>`;
}

export function goalEventTimelineHTML(matchId) {
  const events = getMatchGoalEvents(matchId);
  if (!events.length) return '';
  return `<div class="goal-timeline">${events.map(e => {
    const min = e.minute > 0 ? `${e.minute}'` : "—";
    const assist = e.assist
      ? `<div class="goal-timeline-assist">🎯 ${esc(e.assist)}</div>` : '';
    return `<div class="goal-timeline-item">
      <div class="goal-timeline-main">⚽ <span class="goal-min">${min}</span> <strong>${esc(e.scorer)}</strong></div>
      ${assist}
      <div class="goal-timeline-owner">${esc(e.owner)}</div>
    </div>`;
  }).join('')}</div>`;
}

export function matchGoalSummaryHTML(matchId) {
  const n = getMatchGoalEvents(matchId).length;
  if (!n) return '';
  return `<span class="match-goal-count">${n} goal event${n !== 1 ? 's' : ''}</span>`;
}



export function getSeasonStatTotals(player, seasonFilter) {
  const matchIds = new Set(
    state.db.matches.filter(m => seasonFilter === 'all' || m.season === seasonFilter).map(m => m.id)
  );
  let goals = 0, assists = 0;
  if (state.goalsReady) {
    state.db.goalEvents.filter(e => matchIds.has(e.matchId)).forEach(e => {
      if (e.owner === player) {
        goals++;
        if (e.assist) assists++;
      }
    });
    return { goals, assists };
  }
  state.db.matchStats.filter(s => s.player === player && matchIds.has(s.matchId)).forEach(s => {
    goals += s.goals;
    assists += s.assists;
  });
  return { goals, assists };
}

export function fbPlayerKey(name) {
  return (name || '').trim().toLowerCase();
}

export function getMatchIdsForSeason(seasonFilter) {
  return new Set(
    state.db.matches.filter(m => seasonFilter === 'all' || m.season === seasonFilter).map(m => m.id)
  );
}

export function computeFootballPlayerStats(seasonFilter = 'all') {
  const matchIds = getMatchIdsForSeason(seasonFilter);
  const map = Object.create(null);

  const ensure = (rawName) => {
    const key = fbPlayerKey(rawName);
    if (!key) return null;
    if (!map[key]) map[key] = { name: rawName.trim(), goals: 0, assists: 0, matchIds: new Set() };
    return map[key];
  };

  state.db.goalEvents.filter(e => matchIds.has(e.matchId)).forEach(e => {
    const scorer = ensure(e.scorer);
    if (scorer) {
      scorer.goals++;
      scorer.matchIds.add(e.matchId);
    }
    if (e.assist) {
      const a = ensure(e.assist);
      if (a) {
        a.assists++;
        a.matchIds.add(e.matchId);
      }
    }
  });

  return Object.values(map).map(p => {
    const matches = p.matchIds.size;
    return {
      name: p.name,
      goals: p.goals,
      assists: p.assists,
      contributions: p.goals + p.assists,
      matches,
      gpg: matches ? (p.goals / matches) : 0
    };
  }).sort((a, b) => b.goals - a.goals || b.assists - a.assists);
}
