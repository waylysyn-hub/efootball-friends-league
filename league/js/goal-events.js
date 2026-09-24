import { footballIdentity } from '../../shared/football-identity.js';
import { playerId } from './profiles.js';
import { displayName } from '../../shared/locale.js';
import { state } from './state.js';
import { esc, showToast, showConfirm } from './ui.js';
import { onGoalRowsChange } from './match-entry.js';
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
    .map(name => `<option value="${esc(name)}"${name === selected ? ' selected' : ''}>${esc(displayName(name))}</option>`).join('');
}
function previousName(matchId, owner, field, name) {
  return !!matchId && !!name && getMatchGoalEvents(matchId).some(e => e.owner === owner && e[field] === name);
}
function previousSelection(matchId, owner, field, value) {
  return getMatchGoalEvents(matchId).find(e => e.owner === owner && (value.startsWith('legacy:') ? e.id === value.slice(7) && !e[field + 'Id'] : e[field + 'Id'] === value));
}
function eventSelection(event, field) {
  return event[field + 'Id'] || (event['legacy' + field[0].toUpperCase() + field.slice(1) + 'EventId'] ? 'legacy:' + event['legacy' + field[0].toUpperCase() + field.slice(1) + 'EventId']
    : event.id && event[field] ? 'legacy:' + event.id : getSquad(event.owner).find(p => p.name === event[field])?.id || '');
}
export function squadOptionsHTML(containerId, owner, field, selected = '', exclude = '', snapshotName = '') {
  const members = getSquad(owner).filter(p => p.id !== exclude);
  const placeholder = field === 'assist' ? 'بدون أسيست' : 'اختر المسجّل من التشكيلة';
  const previous = previousSelection(editingMatchId(containerId), owner, field, selected);
  const savedName = previous?.[field] || snapshotName;
  let html = `<option value="">${placeholder}</option>` + members.map(p => {
    const name = p.id === selected && savedName ? savedName : p.name;
    return `<option value="${esc(p.id)}" data-name="${esc(name)}"${p.id === selected ? ' selected' : ''}>${esc(name)} · ${POSITIONS[p.position] || ''}</option>`;
  }).join('');
  if (selected && selected !== exclude && !members.some(p => p.id === selected) && previous) {
    html += `<option value="${esc(selected)}" data-name="${esc(previous[field])}" selected>${esc(previous[field])} · مسجّل سابقًا</option>`;
  }
  return html;
}
export function goalEventRowHTML(e, idx, containerId, p1, p2) {
  const owner = [p1, p2].includes(e.owner) ? e.owner : '';
  const scorer = owner ? eventSelection(e, 'scorer') : '', assist = owner ? eventSelection(e, 'assist') : '';
  const key = `${containerId}-${idx}`;
  return `<article class="ge-row" data-idx="${idx}" data-source-event-id="${esc(e.sourceEventId || e.id || '')}">
    <div class="ge-card-header"><span class="ge-number">هدف ${idx + 1}</span><button type="button" class="btn-sm delete ge-remove" onclick="League.removeGoalEventRow('${containerId}', ${idx})" aria-label="حذف الهدف ${idx + 1}">✕</button></div>
    <div class="ge-fields">
      <div class="ge-field"><label for="${key}-owner">صاحب الفريق</label><select id="${key}-owner" class="ge-owner" aria-describedby="${key}-ownerError" onchange="League.onGoalOwnerChange('${containerId}', ${idx})">${ownerOptionsHTML(p1, p2, owner)}</select><span class="entry-field-error" id="${key}-ownerError"></span></div>
      <div class="ge-field"><label for="${key}-scorer">⚽ المسجّل</label><select id="${key}-scorer" class="ge-scorer" aria-describedby="${key}-scorerError" onchange="League.onGoalScorerChange('${containerId}', ${idx})">${squadOptionsHTML(containerId, owner, 'scorer', scorer, '', e.scorer)}</select><span class="entry-field-error" id="${key}-scorerError"></span></div>
      <div class="ge-field"><label for="${key}-assist">🎯 الأسيست</label><select id="${key}-assist" class="ge-assist" aria-describedby="${key}-assistError" onchange="League.updateGoalEventsUI('${containerId}')">${squadOptionsHTML(containerId, owner, 'assist', assist, scorer, e.assist)}</select><span class="entry-field-error" id="${key}-assistError"></span></div>
      <div class="ge-field"><label for="${key}-minute">الدقيقة <span>(اختياري)</span></label><input id="${key}-minute" type="number" class="ge-minute" aria-describedby="${key}-minuteError" inputmode="numeric" step="1" min="1" max="120" placeholder="1–120" value="${esc(e.minuteInput ?? (Number.isFinite(e.minute) && e.minute !== 0 ? e.minute : ''))}" oninput="League.updateGoalEventsUI('${containerId}')"><span class="entry-field-error" id="${key}-minuteError"></span></div>
    </div>
    <div class="ge-squad-note"></div>
    <button class="btn-sm ge-manage" type="button" onclick="League.openGoalSquad('${containerId}', ${idx})">+ إضافة لاعب للتشكيلة</button>
  </article>`;
}
export function collectGoalEventsFromForm(containerId) {
  return [...(document.getElementById(containerId)?.querySelectorAll('.ge-row') || [])].map((row, i) => {
    const owner = row.querySelector('.ge-owner')?.value || '';
    const event = { owner, ownerId: playerId(owner), sourceEventId: row.dataset.sourceEventId || null,
      minute: Number(row.querySelector('.ge-minute')?.value), minuteInput: row.querySelector('.ge-minute')?.value || '',
      minuteInvalid: !!row.querySelector('.ge-minute')?.validity.badInput, sortOrder: i };
    for (const field of ['scorer', 'assist']) {
      const select = row.querySelector('.ge-' + field), value = select?.value || '';
      event[field] = select?.selectedOptions[0]?.dataset.name || '';
      event[field + 'Id'] = value && !value.startsWith('legacy:') ? value : null;
      event['legacy' + field[0].toUpperCase() + field.slice(1) + 'EventId'] = value.startsWith('legacy:') ? value.slice(7) : null;
    }
    return event;
  });
}
export function renderGoalEventsForm(containerId, events = []) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const { p1, p2 } = getMainMatchPlayers(containerId);
  el.innerHTML = events.length ? events.map((e, i) => goalEventRowHTML(e, i, containerId, p1, p2)).join('')
    : '<div class="empty-state ge-empty">لا توجد أهداف في هذه المباراة.</div>';
  updateGoalEventsUI(containerId);
}
export function onGoalOwnerChange(containerId, idx, syncScore = true) {
  const row = document.getElementById(containerId)?.querySelectorAll('.ge-row')[idx];
  if (!row) return;
  const hadSelection = !!row.querySelector('.ge-scorer').value || !!row.querySelector('.ge-assist').value;
  const owner = row.querySelector('.ge-owner').value;
  row.querySelector('.ge-scorer').innerHTML = squadOptionsHTML(containerId, owner, 'scorer');
  row.querySelector('.ge-assist').innerHTML = squadOptionsHTML(containerId, owner, 'assist');
  updateGoalEventsUI(containerId);
  if (syncScore) { onGoalRowsChange(containerId); if (hadSelection) showToast('تم تغيير الفريق. أعد اختيار المسجّل والأسيست من تشكيلته.'); }
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
    if (!previous || ![p1, p2].includes(previous)) onGoalOwnerChange(containerId, idx, false);
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
  if (events.filter(e => e.owner === owner).length >= 99) return showToast('الحد الأقصى 99 هدفًا لكل فريق.', true);
  events.push({ owner, scorer: '', assist: '', minute: 0 });
  renderGoalEventsForm(containerId, events);
  onGoalRowsChange(containerId);
  document.getElementById(containerId).querySelector('.ge-row:last-child .ge-scorer')?.focus();
}
export function removeGoalEventRow(containerId, idx) {
  const events = collectGoalEventsFromForm(containerId);
  if (!events[idx]) return;
  showConfirm('حذف الهدف', 'سيُحذف هذا الهدف وتفاصيله وتُحدّث النتيجة تلقائيًا. هل تريد المتابعة؟', () => {
    events.splice(idx, 1); renderGoalEventsForm(containerId, events); onGoalRowsChange(containerId);
  });
}
export function countGoalsByOwner(events, p1, p2) {
  return { c1: events.filter(e => e.owner === p1).length, c2: events.filter(e => e.owner === p2).length };
}
export function canKeepLegacyScore(matchId, p1, p2, g1, g2) {
  const match = state.db.matches.find(m => m.id === matchId);
  return !!match && !getMatchGoalEvents(matchId).length && match.player1 === p1 && match.player2 === p2 && match.goals1 === g1 && match.goals2 === g2;
}
export function isSelfAssist(event) {
  return !!event.assist && (event.scorerId && event.assistId ? event.scorerId === event.assistId : event.scorer.toLowerCase() === event.assist.toLowerCase());
}
export function validateGoalEvents(events, p1, p2, g1, g2, { requireSquad = false, matchId = null } = {}) {
  if (!events.length && (!requireSquad || canKeepLegacyScore(matchId, p1, p2, g1, g2))) return null;
  for (let i = 0; i < events.length; i++) {
    const e = events[i], label = `الهدف ${i + 1}: `;
    if (![p1, p2].includes(e.owner) || !e.owner) return label + 'اختر صاحب الفريق من طرفَي المباراة.';
    if (!e.scorer) return label + 'اختر المسجّل من تشكيلة ' + displayName(e.owner) + '.';
    if (!Number.isInteger(e.minute) || e.minute < 0 || e.minute > 120) return label + 'الدقيقة يجب أن تكون عددًا صحيحًا بين 0 و120.';
    if (e.scorer.length > 100 || e.assist.length > 100) return label + 'اسم اللاعب يجب ألا يتجاوز 100 حرف.';
    if (isSelfAssist(e)) return label + 'المسجّل لا يمكن أن يصنع الأسيست لنفسه. اختر زميلًا أو «بدون أسيست».';
    if (requireSquad) for (const field of ['scorer', 'assist']) {
      const name = e[field], id = e[field + 'Id'];
      const legacyId = e['legacy' + field[0].toUpperCase() + field.slice(1) + 'EventId'];
      const previous = getMatchGoalEvents(matchId).some(old => old.owner === e.owner && (id ? old[field + 'Id'] === id : old.id === legacyId && !old[field + 'Id']) && old[field] === name);
      if (name && !(id && getSquad(e.owner).some(p => p.id === id)) && !previous) {
        return label + (field === 'scorer' ? 'المسجّل' : 'صانع الأسيست') + ' غير موجود في تشكيلة ' + displayName(e.owner) + '. حدّث التشكيلة ثم أعد اختياره.';
      }
    }
  }
  const { c1, c2 } = countGoalsByOwner(events, p1, p2);
  if (c1 !== g1 || c2 !== g2) return `تفاصيل الأهداف لا تطابق النتيجة: ${displayName(p1)} (${c1} من ${g1})، ${displayName(p2)} (${c2} من ${g2}). أكمل الأهداف أو اختر حفظ النتيجة فقط.`;
  return null;
}
export function goalEventsSummaryHTML(containerId, events) {
  const { p1, p2 } = getMainMatchPlayers(containerId), { g1, g2 } = getMatchScoreFromForm(containerId);
  if (!events.length && g1 + g2 > 0 && canKeepLegacyScore(editingMatchId(containerId), p1, p2, g1, g2)) return '<div class="ms-total-line">مباراة سابقة دون تفاصيل أهداف. يمكنك حفظ التعديلات مع إبقاء النتيجة كما هي.</div>';
  const { c1, c2 } = countGoalsByOwner(events, p1, p2);
  const ok = c1 === g1 && c2 === g2 && events.every(e => e.scorer);
  return `<div class="ms-total-line ${ok ? 'ok' : 'bad'}"><span>${ok ? '✓ الأهداف مكتملة' : 'أكمل تفاصيل الأهداف'}</span><strong dir="auto">${esc(displayName(p1) || 'الفريق الأول')} ${c1} / ${g1}</strong><strong dir="auto">${esc(displayName(p2) || 'الفريق الثاني')} ${c2} / ${g2}</strong></div>`;
}
export function updateGoalEventsUI(containerId) {
  const events = collectGoalEventsFromForm(containerId);
  const summary = document.getElementById(goalEventsSummaryId(containerId));
  if (summary) { summary.setAttribute('aria-live', 'polite'); summary.innerHTML = goalEventsSummaryHTML(containerId, events); }
  document.querySelectorAll(`#${containerId} .ge-row`).forEach((row, idx) => {
    const e = events[idx], members = getSquad(e.owner);
    const note = row.querySelector('.ge-squad-note');
    note.textContent = !e.owner ? 'اختر صاحب الفريق لعرض تشكيلته.' : !members.length ? `تشكيلة ${displayName(e.owner)} فارغة. أضف لاعبي الفريق أولًا.` : `${members.length} لاعب متاح من تشكيلة ${displayName(e.owner)}`;
    row.querySelector('.ge-manage').hidden = !e.owner || !canManageSquad(e.owner) || !state.squadsReady;
    row.querySelector('.ge-scorer').disabled = !e.owner || !state.squadsReady;
    row.querySelector('.ge-assist').disabled = !e.owner || !state.squadsReady;
  });
  const preview = document.getElementById(containerId === 'goalEventsList' ? 'matchAwardsPreview' : 'editMatchAwardsPreview');
  if (preview) preview.innerHTML = matchAwardsHTML(null, events.filter(e => e.scorer && e.owner)) || '<span class="text-dim">تظهر الجوائز بعد اختيار المسجّلين.</span>';
}
export function syncScoreFromGoalEvents(containerId) {
  onGoalRowsChange(containerId);
}

export function hasMissingGoalDetails(match) {
  const events = getMatchGoalEvents(match.id);
  const { c1, c2 } = countGoalsByOwner(events, match.player1, match.player2);
  return c1 !== match.goals1 || c2 !== match.goals2;
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

export function computeMatchAwards(matchId, events = getMatchGoalEvents(matchId)) {
  const players = aggregateFootballPlayerStats(events);
  if (!players.length) return [];
  const awards = [];
  const maxGoals = Math.max(...players.map(p => p.goals));
  const maxAssists = Math.max(...players.map(p => p.assists));
  const maxMvp = Math.max(...players.map(p => p.goals * 2 + p.assists));

  if (maxGoals > 0) {
    players.filter(p => p.goals === maxGoals).forEach(p => {
      awards.push({ icon: '⚽', title: 'هداف المباراة', player: p.name, owner: p.owner, detail: `الأهداف: ${p.goals}` });
    });
  }
  if (maxAssists > 0) {
    players.filter(p => p.assists === maxAssists).forEach(p => {
      awards.push({ icon: '🎯', title: 'أفضل صانع أهداف', player: p.name, owner: p.owner, detail: `التمريرات الحاسمة: ${p.assists}` });
    });
  }
  if (maxMvp > 0) {
    players.filter(p => p.goals * 2 + p.assists === maxMvp).forEach(p => {
      awards.push({ icon: '👑', title: "أفضل لاعب", player: p.name, owner: p.owner, detail: `الأهداف: ${p.goals} · التمريرات الحاسمة: ${p.assists}` });
    });
  }
  players.filter(p => p.goals >= 3).forEach(p => {
    awards.push({ icon: '🎩', title: 'ثلاثية', player: p.name, owner: p.owner, detail: `الأهداف: ${p.goals}` });
  });
  return awards;
}

export function matchAwardsHTML(matchId, events) {
  const awards = computeMatchAwards(matchId, events);
  if (!awards.length) return '';
  return `<div class="match-awards">${awards.map(a =>
    `<span class="match-award-chip" title="${esc(a.title)} — ${esc(a.detail)}">` +
    `${a.icon} <strong><bdi>${esc(a.player)}</bdi> · ${esc(displayName(a.owner))}</strong> <span class="match-award-title">${esc(a.title)}</span></span>`
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
      <div class="goal-timeline-owner">${esc(displayName(e.owner))}</div>
    </div>`;
  }).join('')}</div>`;
}

export function matchGoalSummaryHTML(matchId) {
  const n = getMatchGoalEvents(matchId).length;
  if (!n) return '';
  return `<span class="match-goal-count">تفاصيل الأهداف المسجّلة: ${n}</span>`;
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

export function fbPlayerKey(name, owner, id = null) { return footballIdentity(name, owner, id); }

export function getMatchIdsForSeason(seasonFilter) {
  return new Set(
    state.db.matches.filter(m => seasonFilter === 'all' || m.season === seasonFilter).map(m => m.id)
  );
}

export function computeFootballPlayerStats(seasonFilter = 'all') {
  const matchIds = getMatchIdsForSeason(seasonFilter);
  return aggregateFootballPlayerStats(state.db.goalEvents.filter(e => matchIds.has(e.matchId)));
}

export function aggregateFootballPlayerStats(events) {
  const map = Object.create(null);

  const ensure = (rawName, owner, id) => {
    const key = fbPlayerKey(rawName, owner, id);
    if (!key) return null;
    if (!map[key]) map[key] = { key, playerId: id || null, name: state.db.squads.find(p => p.id === id)?.name || rawName.trim(), owner, goals: 0, assists: 0, matchIds: new Set() };
    return map[key];
  };

  events.forEach(e => {
    const scorer = ensure(e.scorer, e.owner, e.scorerId);
    if (scorer) {
      scorer.goals++;
      if (e.matchId) scorer.matchIds.add(e.matchId);
    }
    if (e.assist) {
      const a = ensure(e.assist, e.owner, e.assistId);
      if (a) {
        a.assists++;
        if (e.matchId) a.matchIds.add(e.matchId);
      }
    }
  });

  return Object.values(map).map(p => {
    const matches = p.matchIds.size;
    return {
      key: p.key,
      playerId: p.playerId,
      name: p.name,
      owner: p.owner,
      goals: p.goals,
      assists: p.assists,
      contributions: p.goals + p.assists,
      matches,
      gpg: matches ? (p.goals / matches) : 0
    };
  }).sort((a, b) => b.goals - a.goals || b.assists - a.assists);
}
