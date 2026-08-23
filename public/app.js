const screens = {
  entry: document.getElementById('screen-entry'),
  game: document.getElementById('screen-game'),
  result: document.getElementById('screen-result'),
  leaderboard: document.getElementById('screen-leaderboard'),
};

function showScreen(name) {
  Object.values(screens).forEach((s) => s.classList.remove('active'));
  screens[name].classList.add('active');
}

// ---- state ----
let state = {
  id: null,
  min: 100,
  max: 999,
  maxTries: 10,
  low: 100,
  high: 999,
  triesLeft: 10,
};

// ---- entry screen ----
const entryForm = document.getElementById('entry-form');
const entryError = document.getElementById('entry-error');

entryForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  entryError.textContent = '';
  const idInput = document.getElementById('student-id');
  const id = idInput.value.trim();
  if (!id) return;

  const ID_PATTERN = /^[bBgG][0-9]{8}$/;
  if (!ID_PATTERN.test(id)) {
    entryError.textContent = 'ID must start with b or g, followed by 8 digits (e.g. b00109061).';
    return;
  }

  try {
    const res = await fetch('/api/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    const data = await res.json();

    if (!res.ok) {
      entryError.textContent = data.error || 'Something went wrong. Try again.';
      return;
    }

    state.id = data.id;
    state.min = data.min;
    state.max = data.max;
    state.maxTries = data.maxTries;
    state.low = data.min;
    state.high = data.max;
    state.triesLeft = data.maxTries;

    document.getElementById('hud-id').textContent = state.id;
    document.getElementById('hud-tries').textContent = state.triesLeft;
    document.getElementById('history-list').innerHTML = '';
    document.getElementById('feedback-banner').textContent = '';
    document.getElementById('feedback-banner').className = 'feedback';
    document.getElementById('guess-error').textContent = '';
    document.getElementById('guess-input').value = '';
    document.getElementById('guess-input').min = state.min;
    document.getElementById('guess-input').max = state.max;

    updateDial();
    resetLock();
    showScreen('game');
    idInput.value = '';
  } catch (err) {
    entryError.textContent = 'Could not reach the server. Is it running?';
  }
});

document.getElementById('show-leaderboard-btn').addEventListener('click', () => {
  loadLeaderboard();
  showScreen('leaderboard');
});

// ---- game screen ----
const guessForm = document.getElementById('guess-form');
const guessError = document.getElementById('guess-error');
const guessInput = document.getElementById('guess-input');
const feedbackBanner = document.getElementById('feedback-banner');
const historyList = document.getElementById('history-list');

guessForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  guessError.textContent = '';
  const guess = Number(guessInput.value);

  try {
    const res = await fetch('/api/guess', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: state.id, guess }),
    });
    const data = await res.json();

    if (!res.ok) {
      guessError.textContent = data.error || 'Something went wrong.';
      return;
    }

    // narrow the visual range
    if (data.feedback === 'higher') {
      state.low = Math.max(state.low, guess + 1);
    } else if (data.feedback === 'lower') {
      state.high = Math.min(state.high, guess - 1);
    }
    state.triesLeft = data.triesRemaining;

    addHistoryRow(guess, data.feedback);
    document.getElementById('hud-tries').textContent = Math.max(0, state.triesLeft);
    updateDial();
    spinLock(data.feedback);

    feedbackBanner.className = 'feedback ' + data.feedback;
    feedbackBanner.textContent =
      data.feedback === 'correct'
        ? `${guess} — that's it. Vault open.`
        : data.feedback === 'higher'
        ? `${guess} is too low — go higher.`
        : `${guess} is too high — go lower.`;

    guessInput.value = '';
    guessInput.focus();

    if (data.gameOver) {
      setTimeout(() => showResult(data), 550);
    }
  } catch (err) {
    guessError.textContent = 'Could not reach the server. Is it running?';
  }
});

// ---- lock animation ----
const lockGear = document.getElementById('lock-gear');
const lockShackle = document.getElementById('lock-shackle');

function spinLock(feedback) {
  lockGear.classList.remove('spin-cw', 'spin-ccw', 'spin-win');
  void lockGear.offsetWidth; // force reflow so the animation can replay
  if (feedback === 'correct') {
    lockGear.classList.add('spin-win');
    lockShackle.classList.add('open');
  } else if (feedback === 'higher') {
    lockGear.classList.add('spin-cw');
  } else {
    lockGear.classList.add('spin-ccw');
  }
}

function resetLock() {
  lockGear.classList.remove('spin-cw', 'spin-ccw', 'spin-win');
  lockShackle.classList.remove('open');
}

function addHistoryRow(guess, feedback) {
  const li = document.createElement('li');
  const tagText = feedback === 'correct' ? 'CORRECT' : feedback === 'higher' ? 'HIGHER' : 'LOWER';
  li.innerHTML = `<span class="h-num">${guess}</span><span class="h-tag ${feedback}">${tagText}</span>`;
  historyList.prepend(li);
}

function updateDial() {
  const { min, max, low, high } = state;
  const total = max - min;
  const leftPct = ((low - min) / total) * 100;
  const rightPct = ((max - high) / total) * 100;

  const fill = document.getElementById('dial-fill');
  fill.style.left = `${leftPct}%`;
  fill.style.right = `${rightPct}%`;

  document.getElementById('dial-marker-low').style.left = `${leftPct}%`;
  document.getElementById('dial-marker-low').textContent = low;
  document.getElementById('dial-marker-high').style.left = `${100 - rightPct}%`;
  document.getElementById('dial-marker-high').textContent = high;

  document.getElementById('range-text').textContent = `${low} – ${high}`;
  document.getElementById('range-size').textContent = Math.max(0, high - low + 1);
}

// ---- result screen ----
function showResult(data) {
  const won = data.won;
  document.getElementById('result-eyebrow').textContent = won ? 'vault status: open' : 'vault status: sealed';
  document.getElementById('result-title').textContent = won ? 'Cracked it.' : 'Out of tries.';
  document.getElementById('result-subtitle').textContent = won
    ? `Nice work, ${state.id}. You found the code with binary search precision.`
    : `The code slipped away this time, ${state.id}. Halving the range every guess is the fastest way in.`;

  document.getElementById('result-tries').textContent = data.triesUsed;
  document.getElementById('result-code').textContent = won ? data.secret : data.secret;
  const seconds = typeof data.durationMs === 'number' ? (data.durationMs / 1000).toFixed(1) : '—';
  document.getElementById('result-time').textContent = `${seconds}s`;

  showScreen('result');
}

document.getElementById('view-leaderboard-btn').addEventListener('click', () => {
  loadLeaderboard();
  showScreen('leaderboard');
});
document.getElementById('play-again-btn').addEventListener('click', () => {
  showScreen('entry');
});
document.getElementById('back-from-leaderboard-btn').addEventListener('click', () => {
  showScreen('entry');
});

// ---- leaderboard ----
async function loadLeaderboard() {
  const body = document.getElementById('leaderboard-body');
  const empty = document.getElementById('leaderboard-empty');
  body.innerHTML = '';

  try {
    const res = await fetch('/api/leaderboard');
    const rows = await res.json();

    if (!rows.length) {
      empty.style.display = 'block';
      return;
    }
    empty.style.display = 'none';

    rows.forEach((row, i) => {
      const tr = document.createElement('tr');
      const seconds = (row.durationMs / 1000).toFixed(1);
      tr.innerHTML = `<td>${i + 1}</td><td>${escapeHtml(row.id)}</td><td>${row.tries}</td><td>${seconds}s</td>`;
      body.appendChild(tr);
    });
  } catch (err) {
    empty.style.display = 'block';
    empty.textContent = 'Could not load the leaderboard.';
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
