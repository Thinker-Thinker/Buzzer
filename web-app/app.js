/**
 * SPE UI Buzzer Ranking - Production Client
 * Direct WebSocket & HTTP Bridge to ESP32
 */

let ws;
const targetHost = (location.host && location.host !== '' && !location.host.startsWith('file')) ? location.host : '192.168.4.1';
const statusElem = document.getElementById('status');
const rankingList = document.getElementById('ranking');

// Custom Modal Components (Replaces native alert)
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

// Connect to ESP32 WebSocket
function connect() {
  const wsUrl = `ws://${targetHost}/ws`;
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
      setTimeout(connect, 1000);
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
        console.error('Error parsing WebSocket data:', err);
      }
    };
  } catch (err) {
    if (statusElem) {
      statusElem.textContent = 'reconnecting...';
    }
    setTimeout(connect, 1000);
  }
}

// Render the Ranking List
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

    // GSAP entrance animation
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
  // Trigger HTTP reset on ESP32
  fetch(`http://${targetHost}/reset`, { mode: 'no-cors' }).catch((err) => {
    console.warn('HTTP reset request sent');
  });

  // Local optimistic clear
  renderRanking([]);

  // GSAP button micro-interaction
  const resetBtn = document.getElementById('resetBtn');
  if (resetBtn && typeof gsap !== 'undefined') {
    gsap.fromTo(resetBtn, { scale: 0.98 }, { scale: 1, duration: 0.15, ease: "power2.out" });
  }
}

// Spacebar shortcut to trigger New Round
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') {
    e.preventDefault();
    resetRound();
  }
});

// Close modal when clicking backdrop
document.addEventListener('DOMContentLoaded', () => {
  const modal = document.getElementById('customModal');
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });
  }
});

// Expose globals for inline onclick handlers
window.resetRound = resetRound;
window.showModal = showModal;
window.closeModal = closeModal;

// Initialize on page load
connect();
renderRanking([]);
