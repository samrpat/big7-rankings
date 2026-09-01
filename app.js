import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js';
import {
  getFirestore, collection, addDoc, onSnapshot, doc,
  runTransaction, query, where, orderBy, getDocs, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const playersCol = collection(db, 'players');
const gamesCol = collection(db, 'games');

let players = [];       // live cache, sorted by rank
let lastRanks = new Map(); // id -> rank, to detect swaps for animation

// ---------- DOM ----------
const ladderEl = document.getElementById('ladder');
const spotlightEl = document.getElementById('spotlight');
const emptyStateEl = document.getElementById('emptyState');
const toastEl = document.getElementById('toast');

const gameModal = document.getElementById('gameModal');
const playerModal = document.getElementById('playerModal');
const historyModal = document.getElementById('historyModal');

// ---------- Tabs ----------
const views = {
  ladder: document.getElementById('ladderView'),
  history: document.getElementById('historyView'),
  stats: document.getElementById('statsView')
};
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const target = btn.dataset.tab;
    Object.entries(views).forEach(([key, el]) => { el.hidden = key !== target; });
  });
});

document.getElementById('logGameBtn').addEventListener('click', () => {
  if (!gameLoggingUnlocked) {
    showToast(`Tap the 7 logo seven times to unlock (${7 - logoTapCount} to go)`);
    return;
  }
  if (selectedForSwap.length === 2) {
    openGameModal(selectedForSwap[0], selectedForSwap[1]);
  } else {
    showToast('Tap 2 players on the ladder to log a game between them');
  }
});

// ---------- Tap-7-times-to-unlock + tap-2-players admin flow ----------
let gameLoggingUnlocked = false;
let logoTapCount = 0;
let logoTapTimer = null;
let selectedForSwap = []; // up to 2 player ids, picked by tapping ladder rows

function lockGameLogging() {
  gameLoggingUnlocked = false;
  logoTapCount = 0;
  selectedForSwap = [];
  document.getElementById('logGameBtn').classList.add('locked');
  document.getElementById('fabIcon').textContent = '🔒';
  updateFabForSelection();
  renderLadder();
}

function unlockGameLogging() {
  gameLoggingUnlocked = true;
  document.getElementById('logGameBtn').classList.remove('locked');
  document.getElementById('fabIcon').textContent = '＋';
  showToast('Admin mode on — tap 2 players to log a game');
  updateFabForSelection();
}

function updateFabForSelection() {
  const label = document.querySelector('.fab-label');
  const fab = document.getElementById('logGameBtn');
  if (!gameLoggingUnlocked) {
    label.textContent = 'Log Game';
    fab.classList.remove('ready');
  } else if (selectedForSwap.length === 2) {
    label.textContent = `Log: ${nameFor(selectedForSwap[0])} vs ${nameFor(selectedForSwap[1])}`;
    fab.classList.add('ready');
  } else if (selectedForSwap.length === 1) {
    label.textContent = `${nameFor(selectedForSwap[0])} — pick 1 more`;
    fab.classList.remove('ready');
  } else {
    label.textContent = 'Tap 2 players below';
    fab.classList.remove('ready');
  }
}

function handleRungClick(p) {
  if (!gameLoggingUnlocked) {
    openHistory(p);
    return;
  }
  const idx = selectedForSwap.indexOf(p.id);
  if (idx !== -1) {
    selectedForSwap.splice(idx, 1); // tap again to deselect
  } else if (selectedForSwap.length < 2) {
    selectedForSwap.push(p.id);
  } else {
    selectedForSwap = [p.id]; // already had 2 — start a fresh pick
  }
  renderLadder();
  updateFabForSelection();
}

document.querySelector('.wordmark-num').addEventListener('click', () => {
  if (gameLoggingUnlocked) {
    lockGameLogging();
    showToast('Admin mode off');
    return;
  }
  logoTapCount++;
  clearTimeout(logoTapTimer);
  logoTapTimer = setTimeout(() => { logoTapCount = 0; }, 4000);
  if (logoTapCount >= 7) unlockGameLogging();
});
document.getElementById('addPlayerBtn').addEventListener('click', () => openModal(playerModal));

document.querySelectorAll('[data-close]').forEach(btn =>
  btn.addEventListener('click', () => closeAllModals())
);
[gameModal, playerModal, historyModal].forEach(m =>
  m.addEventListener('click', e => { if (e.target === m) closeAllModals(); })
);

function openModal(modal) { modal.hidden = false; }
function closeAllModals() {
  [gameModal, playerModal, historyModal].forEach(m => m.hidden = true);
  document.getElementById('gameFormError').hidden = true;
  document.getElementById('playerFormError').hidden = true;
}

function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.hidden = false;
  setTimeout(() => { toastEl.hidden = true; }, 2200);
}

// Shows who a player beat (green) or lost to (red) — only when that
// game actually moved them on the ladder. Falls back to plain W-L
// (handled by the caller) when the last game didn't change rank.
function contextLine(p) {
  if (!p.lastRankChanged || !p.lastOpponentName) return '';
  if (p.lastResult === 'win') {
    return `<span class="win-move">beat <span class="vs-name">${p.lastOpponentName}</span></span>`;
  }
  if (p.lastResult === 'loss') {
    return `<span class="loss-move">lost to <span class="vs-name">${p.lastOpponentName}</span></span>`;
  }
  return '';
}

function initials(name) {
  return name.trim().split(/\s+/).map(p => p[0]).join('').slice(0, 2).toUpperCase();
}

// ---------- Live ladder ----------
onSnapshot(playersCol, snap => {
  players = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => a.rank - b.rank);
  renderLadder();
  populateGameSelects();
});

function renderLadder() {
  emptyStateEl.hidden = players.length > 0;
  ladderEl.innerHTML = '';

  if (players.length === 0) {
    spotlightEl.innerHTML = '';
    return;
  }

  const king = players[0];
  spotlightEl.innerHTML = `
    <div class="spotlight-card">
      ${king.photoFile
        ? `<img class="spotlight-photo" src="photos/${king.photoFile}" alt="${king.name}">`
        : `<div class="spotlight-photo">${initials(king.name)}</div>`}
      <div>
        <p class="spotlight-label">Top of the Ladder</p>
        <p class="spotlight-name">${king.name}</p>
        <p class="spotlight-record">${contextLine(king) || `<span class="w">${king.wins}W</span> · <span class="l">${king.losses}L</span>`}</p>
      </div>
    </div>`;

  players.forEach(p => {
    const li = document.createElement('li');
    li.className = 'rung';
    li.dataset.id = p.id;

    const prevRank = lastRanks.get(p.id);
    if (prevRank !== undefined && prevRank !== p.rank) {
      li.classList.add('swapped');
      setTimeout(() => li.classList.remove('swapped'), 1100);
    }

    const pickIndex = selectedForSwap.indexOf(p.id);
    if (pickIndex !== -1) li.classList.add('selected');

    const deltaBadge = p.lastRankChanged && p.lastRankDelta
      ? `<span class="rank-delta ${p.lastRankDelta > 0 ? 'up' : 'down'}">${p.lastRankDelta > 0 ? '▲' : '▼'}${Math.abs(p.lastRankDelta)}</span>`
      : '';
    const pickBadge = pickIndex !== -1 ? `<span class="pick-badge">${pickIndex + 1}</span>` : '';

    li.innerHTML = `
      <div class="rank-wrap">
        <span class="rank-badge">${p.rank}</span>
        ${deltaBadge}
      </div>
      ${p.photoFile
        ? `<img class="rung-photo" src="photos/${p.photoFile}" alt="${p.name}">`
        : `<div class="rung-photo">${initials(p.name)}</div>`}
      <div class="rung-info">
        <p class="rung-name">${p.name}</p>
        <p class="rung-meta">${contextLine(p) || `<span class="w">${p.wins}W</span> · <span class="l">${p.losses}L</span>`}</p>
      </div>
      ${pickBadge}`;

    li.addEventListener('click', () => handleRungClick(p));
    ladderEl.appendChild(li);
  });

  lastRanks = new Map(players.map(p => [p.id, p.rank]));
  renderHistoryFeed();
  renderStats();
}

// ---------- History tab (feed of every game) ----------
let allGames = [];
const historyFeedQuery = query(gamesCol, orderBy('timestamp', 'desc'));
onSnapshot(historyFeedQuery, snap => {
  allGames = snap.docs.map(d => d.data());
  renderHistoryFeed();
  renderStats();
});

function nameFor(id) {
  const p = players.find(pl => pl.id === id);
  return p ? p.name : 'Unknown';
}

function renderHistoryFeed() {
  const feedEl = document.getElementById('historyFeed');
  const emptyEl = document.getElementById('historyEmptyState');
  if (!feedEl) return;

  emptyEl.hidden = allGames.length > 0;
  feedEl.innerHTML = allGames.map(g => {
    const winnerName = nameFor(g.winnerId);
    const loserName = nameFor(g.loserId);
    const date = g.timestamp?.seconds
      ? new Date(g.timestamp.seconds * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
      : '';
    const scoreText = g.hasScores ? `<span class="feed-score">${g.player1Score}-${g.player2Score}</span>` : '';
    const swapBadge = g.rankSwapped ? '<span class="feed-swap">Swapped</span>' : '';
    return `
      <li class="feed-item">
        <span class="feed-result">W</span>
        <div class="feed-body">
          <span class="win-name">${winnerName}</span> beat <span class="loss-name">${loserName}</span>${scoreText}
        </div>
        <div class="feed-meta">
          <span class="feed-date">${date}</span>
          ${swapBadge}
        </div>
      </li>`;
  }).join('');
}

// ---------- Add player ----------
document.getElementById('playerForm').addEventListener('submit', async e => {
  e.preventDefault();
  const name = document.getElementById('playerName').value.trim();
  const photoFile = document.getElementById('playerPhoto').value.trim();
  const errEl = document.getElementById('playerFormError');

  if (!name) return;
  try {
    const maxRank = players.reduce((m, p) => Math.max(m, p.rank), 0);
    await addDoc(playersCol, {
      name,
      photoFile: photoFile || null,
      rank: maxRank + 1,
      wins: 0,
      losses: 0,
      totalPoints: 0,
      lastResult: null,
      lastOpponentName: null,
      lastRankChanged: false,
      lastRankDelta: 0,
      createdAt: serverTimestamp()
    });
    e.target.reset();
    closeAllModals();
    showToast(`${name} added to the ladder`);
  } catch (err) {
    errEl.textContent = 'Could not add player. Check your connection and try again.';
    errEl.hidden = false;
  }
});

// ---------- Log game ----------
function openGameModal(presetP1Id, presetP2Id) {
  if (players.length < 2) {
    showToast('Add at least 2 players first');
    return;
  }
  document.getElementById('gameForm').reset();
  selectedWinnerSide = null;
  document.querySelectorAll('.winner-option').forEach(b => b.classList.remove('selected'));
  if (presetP1Id && presetP2Id) {
    document.getElementById('player1Select').value = presetP1Id;
    document.getElementById('player2Select').value = presetP2Id;
    updateWinnerLabels();
  }
  syncScoreMode();
  openModal(gameModal);
}

let selectedWinnerSide = null; // 1 or 2, used when scores are off

function populateGameSelects() {
  const s1 = document.getElementById('player1Select');
  const s2 = document.getElementById('player2Select');
  const opts = players
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(p => `<option value="${p.id}">${p.name}</option>`)
    .join('');
  s1.innerHTML = opts;
  s2.innerHTML = opts;
  if (players.length > 1) s2.selectedIndex = 1;
  updateWinnerLabels();
}

function updateWinnerLabels() {
  const s1 = document.getElementById('player1Select');
  const s2 = document.getElementById('player2Select');
  const opts = document.querySelectorAll('.winner-option');
  if (opts[0]) opts[0].textContent = s1.options[s1.selectedIndex]?.text || 'Player 1';
  if (opts[1]) opts[1].textContent = s2.options[s2.selectedIndex]?.text || 'Player 2';
}

document.getElementById('player1Select').addEventListener('change', updateWinnerLabels);
document.getElementById('player2Select').addEventListener('change', updateWinnerLabels);

document.querySelectorAll('.winner-option').forEach(btn => {
  btn.addEventListener('click', () => {
    selectedWinnerSide = Number(btn.dataset.side);
    document.querySelectorAll('.winner-option').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
  });
});

function syncScoreMode() {
  const tracking = document.getElementById('trackScores').checked;
  document.querySelectorAll('.score-input').forEach(el => {
    el.hidden = !tracking;
    el.required = tracking;
    if (!tracking) el.value = '';
  });
  const picker = document.getElementById('winnerPicker');
  picker.hidden = tracking;
  if (tracking) {
    selectedWinnerSide = null;
    document.querySelectorAll('.winner-option').forEach(b => b.classList.remove('selected'));
  } else {
    updateWinnerLabels();
  }
}
document.getElementById('trackScores').addEventListener('change', syncScoreMode);

document.getElementById('gameForm').addEventListener('submit', async e => {
  e.preventDefault();
  const errEl = document.getElementById('gameFormError');
  const p1Id = document.getElementById('player1Select').value;
  const p2Id = document.getElementById('player2Select').value;
  const tracking = document.getElementById('trackScores').checked;

  if (p1Id === p2Id) {
    errEl.textContent = 'Pick two different players.';
    errEl.hidden = false;
    return;
  }

  let winnerId, loserId, winnerScore, loserScore;

  if (tracking) {
    const p1Score = Number(document.getElementById('player1Score').value);
    const p2Score = Number(document.getElementById('player2Score').value);
    if (p1Score === p2Score) {
      errEl.textContent = 'Games need a winner — scores can\'t tie.';
      errEl.hidden = false;
      return;
    }
    winnerId = p1Score > p2Score ? p1Id : p2Id;
    loserId = p1Score > p2Score ? p2Id : p1Id;
    winnerScore = Math.max(p1Score, p2Score);
    loserScore = Math.min(p1Score, p2Score);
  } else {
    if (!selectedWinnerSide) {
      errEl.textContent = 'Pick who won.';
      errEl.hidden = false;
      return;
    }
    winnerId = selectedWinnerSide === 1 ? p1Id : p2Id;
    loserId = selectedWinnerSide === 1 ? p2Id : p1Id;
    winnerScore = null;
    loserScore = null;
  }

  try {
    await logGame(winnerId, loserId, winnerScore, loserScore);
    closeAllModals();
    showToast('Game logged');
    if (gameLoggingUnlocked) lockGameLogging(); // re-lock — each game requires the ritual again
  } catch (err) {
    errEl.textContent = 'Could not save game. Check your connection and try again.';
    errEl.hidden = false;
  }
});

/**
 * Core ranking rule:
 * - Winner and loser both get their W/L updated (points too, if tracked).
 * - If the winner's rank number was HIGHER than the loser's (i.e. winner
 *   was ranked worse going in), they swap rank positions.
 * - If the winner was already ranked better, no rank change — just the record.
 * Scores are optional: pass null/null for a scoreless game.
 */
async function logGame(winnerId, loserId, winnerScore, loserScore) {
  const hasScores = winnerScore !== null && loserScore !== null;

  await runTransaction(db, async tx => {
    const winnerRef = doc(db, 'players', winnerId);
    const loserRef = doc(db, 'players', loserId);
    const winnerSnap = await tx.get(winnerRef);
    const loserSnap = await tx.get(loserRef);
    if (!winnerSnap.exists() || !loserSnap.exists()) throw new Error('Player missing');

    const winner = winnerSnap.data();
    const loser = loserSnap.data();

    const winnerRankBefore = winner.rank;
    const loserRankBefore = loser.rank;

    // Every game swaps the two players' rank slots — no matter who was
    // ranked higher going in. Winner takes the loser's old rank, loser
    // takes the winner's old rank.
    const willSwap = true;
    const winnerRankAfter = loserRankBefore;
    const loserRankAfter = winnerRankBefore;

    // Positive = moved up the ladder (better), negative = moved down.
    const winnerDelta = winnerRankBefore - winnerRankAfter;
    const loserDelta = loserRankBefore - loserRankAfter;

    tx.update(winnerRef, {
      wins: (winner.wins || 0) + 1,
      totalPoints: (winner.totalPoints || 0) + (hasScores ? winnerScore : 0),
      rank: winnerRankAfter,
      lastResult: 'win',
      lastOpponentName: loser.name,
      lastRankChanged: willSwap,
      lastRankDelta: winnerDelta
    });
    tx.update(loserRef, {
      losses: (loser.losses || 0) + 1,
      totalPoints: (loser.totalPoints || 0) + (hasScores ? loserScore : 0),
      rank: loserRankAfter,
      lastResult: 'loss',
      lastOpponentName: winner.name,
      lastRankChanged: willSwap,
      lastRankDelta: loserDelta
    });

    const gameRef = doc(gamesCol);
    tx.set(gameRef, {
      player1Id: winnerId,
      player2Id: loserId,
      player1Score: hasScores ? winnerScore : null,
      player2Score: hasScores ? loserScore : null,
      hasScores,
      winnerId,
      loserId,
      rankSwapped: willSwap,
      player1RankBefore: winnerRankBefore,
      player1RankAfter: winnerRankAfter,
      player2RankBefore: loserRankBefore,
      player2RankAfter: loserRankAfter,
      timestamp: serverTimestamp()
    });
  });
}

// ---------- History ----------
async function openHistory(player) {
  document.getElementById('historyModalTitle').textContent = `${player.name}`;
  document.getElementById('historyStats').innerHTML = `
    <div><b>${player.wins}</b>Wins</div>
    <div><b>${player.losses}</b>Losses</div>
    <div><b>${player.totalPoints}</b>Career pts</div>
    <div><b>#${player.rank}</b>Current rank</div>`;

  const listEl = document.getElementById('historyList');
  listEl.innerHTML = '<li class="history-item">Loading…</li>';
  openModal(historyModal);

  try {
    const [q1, q2] = await Promise.all([
      getDocs(query(gamesCol, where('player1Id', '==', player.id), orderBy('timestamp', 'desc'))),
      getDocs(query(gamesCol, where('player2Id', '==', player.id), orderBy('timestamp', 'desc')))
    ]);
    const games = [...q1.docs, ...q2.docs]
      .map(d => d.data())
      .sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));

    if (games.length === 0) {
      listEl.innerHTML = '<li class="history-item">No games logged yet.</li>';
      return;
    }

    listEl.innerHTML = games.map(g => {
      const won = g.winnerId === player.id;
      const oppId = won ? g.loserId : g.winnerId;
      const opp = players.find(p => p.id === oppId);
      const date = g.timestamp?.seconds
        ? new Date(g.timestamp.seconds * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
        : '';
      const swapNote = g.rankSwapped ? ' · swapped' : '';
      const scoreText = g.hasScores
        ? ` — ${won ? g.player1Score : g.player2Score}-${won ? g.player2Score : g.player1Score}`
        : '';
      return `
        <li class="history-item">
          <span class="history-result ${won ? 'win' : 'loss'}">${won ? 'W' : 'L'}</span>
          <span>vs ${opp ? opp.name : 'Unknown'}${scoreText}</span>
          <span class="history-meta">${date}${won ? swapNote : ''}</span>
        </li>`;
    }).join('');
  } catch (err) {
    listEl.innerHTML = '<li class="history-item">Could not load history.</li>';
  }
}

// ---------- Stats tab ----------
function gamesFor(playerId) {
  return allGames
    .filter(g => g.winnerId === playerId || g.loserId === playerId)
    .slice()
    .sort((a, b) => (a.timestamp?.seconds || 0) - (b.timestamp?.seconds || 0)); // oldest first
}

function winPctOf(gameList, playerId) {
  if (gameList.length === 0) return null;
  const wins = gameList.filter(g => g.winnerId === playerId).length;
  return Math.round((wins / gameList.length) * 100);
}

function computeTrend(gameList, playerId) {
  if (gameList.length < 4) return { label: 'Not enough games yet', cls: 'flat' };
  const mid = Math.floor(gameList.length / 2);
  const firstPct = winPctOf(gameList.slice(0, mid), playerId);
  const secondPct = winPctOf(gameList.slice(mid), playerId);
  const diff = secondPct - firstPct;
  if (diff >= 15) return { label: `Improving (+${diff}%)`, cls: 'up' };
  if (diff <= -15) return { label: `Cooling off (${diff}%)`, cls: 'down' };
  return { label: 'Steady', cls: 'flat' };
}

function computeStreak(gameList, playerId) {
  if (gameList.length === 0) return '';
  let count = 0;
  let type = null;
  for (let i = gameList.length - 1; i >= 0; i--) {
    const won = gameList[i].winnerId === playerId;
    const resultType = won ? 'win' : 'loss';
    if (type === null) type = resultType;
    if (resultType !== type) break;
    count++;
  }
  if (count < 2) return '';
  return type === 'win' ? `${count}-game win streak` : `${count}-game skid`;
}

function computeHeadToHead(gameList, playerId) {
  const map = new Map(); // opponentId -> {wins, losses}
  gameList.forEach(g => {
    const won = g.winnerId === playerId;
    const oppId = won ? g.loserId : g.winnerId;
    if (!map.has(oppId)) map.set(oppId, { wins: 0, losses: 0 });
    const rec = map.get(oppId);
    won ? rec.wins++ : rec.losses++;
  });
  return [...map.entries()]
    .map(([oppId, rec]) => ({ oppId, ...rec, name: nameFor(oppId) }))
    .sort((a, b) => (b.wins + b.losses) - (a.wins + a.losses)); // most-played first
}

function renderStats() {
  const listEl = document.getElementById('statsList');
  const summaryEl = document.getElementById('statsSummary');
  const emptyEl = document.getElementById('statsEmptyState');
  if (!listEl) return;

  emptyEl.hidden = allGames.length > 0;
  const scoredGamesTotal = allGames.filter(g => g.hasScores).length;
  summaryEl.textContent = `${allGames.length} game${allGames.length === 1 ? '' : 's'} logged (${scoredGamesTotal} with scores) · ${players.length} players`;

  const sorted = players.slice().sort((a, b) => a.rank - b.rank);

  listEl.innerHTML = sorted.map(p => {
    const gameList = gamesFor(p.id);
    const winPct = p.wins + p.losses > 0 ? Math.round((p.wins / (p.wins + p.losses)) * 100) : null;
    const trend = computeTrend(gameList, p.id);
    const streak = computeStreak(gameList, p.id);
    const h2h = computeHeadToHead(gameList, p.id);

    const scoredGames = gameList.filter(g => g.hasScores);
    const pointsScored = scoredGames.map(g => g.winnerId === p.id ? g.player1Score : g.player2Score);
    const avgPoints = pointsScored.length
      ? (pointsScored.reduce((a, b) => a + b, 0) / pointsScored.length).toFixed(1)
      : null;
    const bestGame = pointsScored.length ? Math.max(...pointsScored) : null;

    const h2hRows = h2h.map(row => {
      const cls = row.wins > row.losses ? 'win' : row.wins < row.losses ? 'loss' : 'even';
      return `
        <div class="h2h-row">
          <span class="h2h-name">vs ${row.name}</span>
          <span class="h2h-record ${cls}">${row.wins}-${row.losses}</span>
        </div>`;
    }).join('');

    return `
      <div class="stat-card">
        <div class="stat-head">
          ${p.photoFile
            ? `<img class="stat-photo" src="photos/${p.photoFile}" alt="${p.name}">`
            : `<div class="stat-photo">${initials(p.name)}</div>`}
          <div>
            <p class="stat-name">${p.name}</p>
            <p class="stat-sub">${p.wins}W · ${p.losses}L · rank #${p.rank}</p>
          </div>
          <div class="stat-winpct">
            <span class="num">${winPct !== null ? winPct + '%' : '—'}</span>
            <span class="label">Win rate</span>
          </div>
        </div>
        <span class="trend-badge ${trend.cls}">${trend.label}</span>
        ${streak ? `<span class="streak-note">${streak}</span>` : ''}
        <div class="mini-stats">
          <div><span class="mini-num">${gameList.length}</span><span class="mini-label">Games</span></div>
          <div><span class="mini-num">${avgPoints ?? '—'}</span><span class="mini-label">Avg pts</span></div>
          <div><span class="mini-num">${bestGame ?? '—'}</span><span class="mini-label">Best game</span></div>
          <div><span class="mini-num">${p.totalPoints}</span><span class="mini-label">Total pts</span></div>
        </div>
        ${h2h.length ? `<div class="h2h-grid">${h2hRows}</div>` : ''}
      </div>`;
  }).join('');
}
