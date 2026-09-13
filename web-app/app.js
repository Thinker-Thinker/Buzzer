/**
 * SPE UI Buzzer Ranking - Universal Client
 * With Minimalist Score Tracking & Question Timer
 */

let ws;
const isFile = location.protocol.startsWith('file');
const wsProtocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
const targetHost = (!isFile && location.host) ? location.host : '192.168.4.1';
const wsUrl = isFile ? `ws://192.168.4.1/ws` : `${wsProtocol}//${targetHost}/ws`;
const resetUrl = isFile ? `http://192.168.4.1/reset` : `/reset`;

// DOM Elements
const statusElem = document.getElementById('status');
const rankingList = document.getElementById('ranking');
const scoreboardGrid = document.getElementById('scoreboardGrid');
const timerDisplay = document.getElementById('timerDisplay');
const timerToggleBtn = document.getElementById('timerToggleBtn');

// State
const state = {
  scores: JSON.parse(localStorage.getItem('spe_buzzer_scores') || '[0, 0, 0, 0]'),
  playerNames: ['Player 1', 'Player 2', 'Player 3', 'Player 4'],
  timerDuration: 10,
  timerRemaining: 10,
  timerInterval: null,
  isTimerRunning: false
};

// Custom Modal (Replaces native alert)
function showModal(title, message) {
  const modal = document.getElementById('customModal');
  const titleElem = document.getElementById('modalTitle');
  const msgElem = document.getElementById('modalMessage');
  if (titleElem) titleElem.textContent = title;
  if (msgElem) msgElem.textContent = message;
  if (modal) modal.classList.add('active');
}

function closeModal() {
  const modal = document.getElementById('customModal');
  if (modal) modal.classList.remove('active');
}

// Timer Logic
function updateTimerDisplay() {
  if (timerDisplay) {
    timerDisplay.textContent = `${state.timerRemaining}s`;
  }
}

function toggleTimer() {
  if (state.isTimerRunning) {
    // Pause
    clearInterval(state.timerInterval);
    state.isTimerRunning = false;
    if (timerToggleBtn) timerToggleBtn.textContent = 'Start';
  } else {
    // Start
    if (state.timerRemaining <= 0) {
      state.timerRemaining = state.timerDuration;
      updateTimerDisplay();
    }
    state.isTimerRunning = true;
    if (timerToggleBtn) timerToggleBtn.textContent = 'Pause';

    state.timerInterval = setInterval(() => {
      state.timerRemaining--;
      updateTimerDisplay();

      if (state.timerRemaining <= 0) {
        clearInterval(state.timerInterval);
        state.isTimerRunning = false;
        if (timerToggleBtn) timerToggleBtn.textContent = 'Start';
        if (typeof gsap !== 'undefined') {
          gsap.fromTo(timerDisplay, { scale: 1.15, color: '#dc2626' }, { scale: 1, color: '#2563eb', duration: 0.5 });
        }
      }
    }, 1000);
  }
}

function resetTimer() {
  clearInterval(state.timerInterval);
  state.isTimerRunning = false;
  state.timerRemaining = state.timerDuration;
  if (timerToggleBtn) timerToggleBtn.textContent = 'Start';
  updateTimerDisplay();
}

function setTimerDuration(seconds) {
  state.timerDuration = seconds;
  resetTimer();

  // Update active preset button
  document.querySelectorAll('.btn-preset').forEach(btn => {
    if (btn.textContent.trim() === `${seconds}s`) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
}

// Scoreboard Logic
function renderScoreboard() {
  if (!scoreboardGrid) return;
  scoreboardGrid.innerHTML = '';

  state.playerNames.forEach((name, index) => {
    const card = document.createElement('div');
    card.className = 'score-card';
    card.innerHTML = `
      <div class="score-card-top">
        <span class="score-player-name">${name}</span>
        <span class="score-digits" id="scoreVal${index}">${state.scores[index]}</span>
      </div>
      <div class="score-btn-group">
        <button type="button" class="btn-score-mod" onclick="modifyScore(${index}, 10)">+10</button>
        <button type="button" class="btn-score-mod" onclick="modifyScore(${index}, -5)">-5</button>
      </div>
    `;
    scoreboardGrid.appendChild(card);
  });
}

function modifyScore(playerIndex, amount) {
  state.scores[playerIndex] = Math.max(0, state.scores[playerIndex] + amount);
  localStorage.setItem('spe_buzzer_scores', JSON.stringify(state.scores));
  const valElem = document.getElementById(`scoreVal${playerIndex}`);
  if (valElem) {
    valElem.textContent = state.scores[playerIndex];
    if (typeof gsap !== 'undefined') {
      gsap.fromTo(valElem, { scale: 1.2 }, { scale: 1, duration: 0.2, ease: "back.out(2)" });
    }
  }
}

function resetAllScores() {
  state.scores = [0, 0, 0, 0];
  localStorage.setItem('spe_buzzer_scores', JSON.stringify(state.scores));
  renderScoreboard();
}

// WebSocket Connection
function connect() {
  if (statusElem) {
    statusElem.textContent = 'connecting...';
    statusElem.className = 'status';
  }

  try {
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      if (statusElem) {
        statusElem.textContent = 'connected';
        statusElem.className = 'status connected';
      }
    };

    ws.onclose = () => {
      if (statusElem) {
        statusElem.textContent = 'reconnecting...';
        statusElem.className = 'status';
      }
      setTimeout(connect, 1500);
    };

    ws.onerror = () => {
      if (statusElem) {
        statusElem.textContent = 'reconnecting...';
        statusElem.className = 'status';
      }
    };

    ws.onmessage = (evt) => {
      try {
        const data = JSON.parse(evt.data);
        renderRanking(data.ranking || []);
      } catch (err) {
        console.error('WebSocket parse error:', err);
      }
    };
  } catch (err) {
    if (statusElem) {
      statusElem.textContent = 'reconnecting...';
    }
    setTimeout(connect, 1500);
  }
}

// Render Ranking
function renderRanking(ranking) {
  if (!rankingList) return;
  rankingList.innerHTML = '';

  if (!ranking || ranking.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-placeholder';
    empty.innerHTML = `
      <div class="waiting-pill">
        <span class="waiting-dot"></span>
        <span class="waiting-dot"></span>
        <span class="waiting-dot"></span>
      </div>
    `;
    rankingList.appendChild(empty);

    if (typeof gsap !== 'undefined') {
      gsap.to('.waiting-dot', {
        y: -5,
        stagger: 0.15,
        repeat: -1,
        yoyo: true,
        duration: 0.45,
        ease: "power1.inOut"
      });
    }
    return;
  }

  ranking.forEach((player, i) => {
    const li = document.createElement('li');
    li.className = `ranking-item ${i === 0 ? 'rank-1' : ''}`;
    li.innerHTML = `
      <div class="player-content">
        <span class="rank-number">#${i + 1}</span>
        <span class="player-name">${player.name || `Player ${player.id + 1}`}</span>
      </div>
    `;
    rankingList.appendChild(li);

    if (typeof gsap !== 'undefined') {
      gsap.from(li, {
        opacity: 0,
        y: 6,
        duration: 0.2,
        delay: i * 0.04,
        ease: "power2.out"
      });
    }
  });
}

// Reset Round
function resetRound() {
  fetch(resetUrl, { mode: 'no-cors' }).catch(() => {});
  renderRanking([]);

  const resetBtn = document.getElementById('resetBtn');
  if (resetBtn && typeof gsap !== 'undefined') {
    gsap.fromTo(resetBtn, { scale: 0.98 }, { scale: 1, duration: 0.15, ease: "power2.out" });
  }
}

// Hotkeys
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') {
    e.preventDefault();
    resetRound();
  }
});

// Modal close on backdrop
document.addEventListener('DOMContentLoaded', () => {
  const modal = document.getElementById('customModal');
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });
  }
});

// Expose globals for inline onclicks
window.resetRound = resetRound;
window.toggleTimer = toggleTimer;
window.resetTimer = resetTimer;
window.setTimerDuration = setTimerDuration;
window.modifyScore = modifyScore;
window.resetAllScores = resetAllScores;
window.showModal = showModal;
window.closeModal = closeModal;

// Initialize
connect();
renderRanking([]);
renderScoreboard();
updateTimerDisplay();
