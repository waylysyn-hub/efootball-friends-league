import { state } from './state.js';
import { esc, showToast } from './ui.js';
import { updateMatchPreview } from './matches.js';

export function getMatchGoalEvents(matchId) {
  return state.db.goalEvents
    .filter(e => e.matchId === matchId)
    .sort((a, b) => (a.minute - b.minute) || (a.sortOrder - b.sortOrder));
}

export function getMainMatchPlayers(containerId) {
  if (containerId === 'editGoalEventsList') {
    return {
      p1: document.getElementById('editPlayer1')?.value || '',
      p2: document.getElementById('editPlayer2')?.value || ''
    };
  }
  return {
    p1: document.getElementById('matchPlayer1')?.value || '',
    p2: document.getElementById('matchPlayer2')?.value || ''
  };
}

export function getMatchScoreFromForm(containerId) {
  if (containerId === 'editGoalEventsList') {
    return {
      g1: parseInt(document.getElementById('editGoals1')?.value) || 0,
      g2: parseInt(document.getElementById('editGoals2')?.value) || 0
    };
  }
  return {
    g1: parseInt(document.getElementById('matchGoals1')?.value) || 0,
    g2: parseInt(document.getElementById('matchGoals2')?.value) || 0
  };
}

export function goalEventsSummaryId(containerId) {
  return containerId === 'goalEventsList' ? 'goalEventsSummary' : 'editGoalEventsSummary';
}

export function ownerOptionsHTML(p1, p2, selected) {
  if (!p1 && !p2) return '<option value="">— Select players above —</option>';
  let html = '';
  if (p1) html += `<option value="${esc(p1)}"${selected === p1 ? ' selected' : ''}>${esc(p1)}</option>`;
  if (p2 && p2 !== p1) html += `<option value="${esc(p2)}"${selected === p2 ? ' selected' : ''}>${esc(p2)}</option>`;
  return html;
}

export function goalEventRowHTML(e, idx, containerId, p1, p2) {
  return `<div class="ge-row" data-idx="${idx}">
    <select class="ge-owner" aria-label="Goal owner" onchange="League.updateGoalEventsUI('${containerId}')">${ownerOptionsHTML(p1, p2, e.owner)}</select>
    <input type="text" class="ge-scorer" aria-label="Scorer" maxlength="100" placeholder="Scorer" value="${esc(e.scorer || '')}" oninput="League.updateGoalEventsUI('${containerId}')">
    <input type="text" class="ge-assist" aria-label="Assist" maxlength="100" placeholder="Assist (opt.)" value="${esc(e.assist || '')}" oninput="League.updateGoalEventsUI('${containerId}')">
    <input type="number" class="ge-minute" aria-label="Minute" step="1" min="0" max="120" placeholder="Min" value="${e.minute ?? ''}" oninput="League.updateGoalEventsUI('${containerId}')">
    <button type="button" class="btn-sm delete ge-remove" onclick="League.removeGoalEventRow('${containerId}', ${idx})" title="Remove">✕</button>
  </div>`;
}

export function collectGoalEventsFromForm(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return [];
  const events = [];
  el.querySelectorAll('.ge-row').forEach((row, i) => {
    const owner = row.querySelector('.ge-owner')?.value || '';
    const scorer = (row.querySelector('.ge-scorer')?.value || '').trim();
    const assist = (row.querySelector('.ge-assist')?.value || '').trim();
    const minute = Number(row.querySelector('.ge-minute')?.value);
    if (!scorer && !owner) return;
    events.push({
      owner,
      scorer,
      assist,
      minute,
      sortOrder: i
    });
  });
  return events;
}

export function renderGoalEventsForm(containerId, events) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const { p1, p2 } = getMainMatchPlayers(containerId);
  const list = events || [];

  if (!list.length) {
    el.innerHTML = `<div class="ge-header">
      <span>Owner</span><span>Scorer</span><span>Assist</span><span>Min</span><span></span>
    </div>
    <div class="empty-state ge-empty">No goals yet — click “Add Goal Event”.</div>`;
  } else {
    el.innerHTML = `<div class="ge-header">
      <span>Owner</span><span>Scorer</span><span>Assist</span><span>Min</span><span></span>
    </div>
    ${list.map((e, i) => goalEventRowHTML(e, i, containerId, p1, p2)).join('')}`;
  }
  updateGoalEventsUI(containerId);
}

export function addGoalEventRow(containerId) {
  const { p1, p2 } = getMainMatchPlayers(containerId);
  if (!p1 || !p2) return showToast('Select Player 1 and Player 2 first.', true);
  const events = collectGoalEventsFromForm(containerId);
  events.push({ owner: p1, scorer: '', assist: '', minute: 0, sortOrder: events.length });
  renderGoalEventsForm(containerId, events);
}

export function removeGoalEventRow(containerId, idx) {
  const events = collectGoalEventsFromForm(containerId);
  events.splice(idx, 1);
  renderGoalEventsForm(containerId, events);
}

export function countGoalsByOwner(events, p1, p2) {
  let c1 = 0, c2 = 0;
  events.forEach(e => {
    if (e.owner === p1) c1++;
    else if (e.owner === p2) c2++;
  });
  return { c1, c2 };
}

export function validateGoalEvents(events, p1, p2, g1, g2) {
  if (!events.length) return null;
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (!Number.isInteger(e.minute) || e.minute < 0 || e.minute > 120) return 'Goal minutes must be whole numbers from 0 to 120.';
    if (e.scorer.length > 100 || e.assist.length > 100) return 'Scorer and assist names must be 100 characters or fewer.';
    if (!e.scorer) return `Goal ${i + 1}: enter a scorer name.`;
    if (!e.owner) return `Goal ${i + 1}: select team owner.`;
    if (e.owner !== p1 && e.owner !== p2) return `Goal ${i + 1}: owner must be ${p1} or ${p2}.`;
  }
  const { c1, c2 } = countGoalsByOwner(events, p1, p2);
  if (c1 !== g1 || c2 !== g2) {
    return `Goal events: ${p1} has ${c1} (need ${g1}), ${p2} has ${c2} (need ${g2}).`;
  }
  return null;
}

export function goalEventsSummaryHTML(containerId, events) {
  const { p1, p2 } = getMainMatchPlayers(containerId);
  const { g1, g2 } = getMatchScoreFromForm(containerId);
  const { c1, c2 } = countGoalsByOwner(events, p1, p2);
  const total = events.length;
  const expected = g1 + g2;
  const ok = c1 === g1 && c2 === g2 && total === expected;
  return `<div class="ms-total-line ${ok ? 'ok' : 'bad'}">
    Goals: <strong>${esc(p1 || 'P1')} ${c1}/${g1}</strong> · <strong>${esc(p2 || 'P2')} ${c2}/${g2}</strong>
    · Total <strong>${total}</strong> / <strong>${expected}</strong>
    ${ok ? ' ✓' : ''}
  </div>`;
}

export function updateGoalEventsUI(containerId) {
  const events = collectGoalEventsFromForm(containerId);
  const summaryEl = document.getElementById(goalEventsSummaryId(containerId));
  if (summaryEl) summaryEl.innerHTML = events.length ? goalEventsSummaryHTML(containerId, events) : '';

  const previewId = containerId === 'goalEventsList' ? 'matchAwardsPreview' : 'editMatchAwardsPreview';
  const preview = document.getElementById(previewId);
  if (!preview) return;
  if (!events.length) {
    preview.innerHTML = '<span class="text-dim">Add goal events to preview match awards.</span>';
    return;
  }
  preview.innerHTML = matchAwardsHTML(null, events) || '<span class="text-dim">No awards yet.</span>';
}

export function syncScoreFromGoalEvents(containerId) {
  const { p1, p2 } = getMainMatchPlayers(containerId);
  const events = collectGoalEventsFromForm(containerId);
  const { c1, c2 } = countGoalsByOwner(events, p1, p2);
  if (containerId === 'editGoalEventsList') {
    document.getElementById('editGoals1').value = c1;
    document.getElementById('editGoals2').value = c2;
  } else {
    document.getElementById('matchGoals1').value = c1;
    document.getElementById('matchGoals2').value = c2;
    updateMatchPreview();
  }
  updateGoalEventsUI(containerId);
  showToast('Score updated from goal events.');
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
  const map = {};

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
