const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'results.json');
const MIN_CODE = 100;
const MAX_CODE = 999;
const MAX_TRIES = 10;

// ---------- storage helpers ----------
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '[]', 'utf8');

function readResults() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(raw || '[]');
  } catch (e) {
    console.error('Failed to read results.json, starting fresh:', e);
    return [];
  }
}

function writeResults(results) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(results, null, 2), 'utf8');
}

function normalizeId(id) {
  return String(id || '').trim();
}

// in-memory games currently in progress, keyed by normalized id
const activeGames = new Map();

// ---------- middleware ----------
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---------- API ----------

// Start a new game for a given student id
app.post('/api/start', (req, res) => {
  const idRaw = req.body.id;
  const id = normalizeId(idRaw);

  if (!id) {
    return res.status(400).json({ error: 'Please enter your student ID.' });
  }

  const ID_PATTERN = /^[bBgG][0-9]{8}$/;
  if (!ID_PATTERN.test(id)) {
    return res.status(400).json({
      error: 'ID must start with b or g, followed by 8 digits (e.g. b00109061).',
    });
  }

  const results = readResults();
  const alreadyPlayed = results.some(
    (r) => r.id.toLowerCase() === id.toLowerCase()
  );
  if (alreadyPlayed) {
    return res.status(409).json({
      error: `ID "${id}" has already played this game. Each ID only gets one attempt.`,
    });
  }

  if (activeGames.has(id.toLowerCase())) {
    return res.status(409).json({
      error: 'A game is already in progress for this ID. Finish that game first.',
    });
  }

  const secret =
    Math.floor(Math.random() * (MAX_CODE - MIN_CODE + 1)) + MIN_CODE;

  activeGames.set(id.toLowerCase(), {
    id,
    secret,
    guesses: [],
    startTime: Date.now(),
  });

  res.json({
    ok: true,
    id,
    min: MIN_CODE,
    max: MAX_CODE,
    maxTries: MAX_TRIES,
  });
});

// Submit a guess
app.post('/api/guess', (req, res) => {
  const id = normalizeId(req.body.id).toLowerCase();
  const guess = Number(req.body.guess);

  const game = activeGames.get(id);
  if (!game) {
    return res.status(400).json({ error: 'No active game found for this ID. Please start a new game.' });
  }

  if (!Number.isInteger(guess) || guess < MIN_CODE || guess > MAX_CODE) {
    return res.status(400).json({
      error: `Enter a whole number between ${MIN_CODE} and ${MAX_CODE}.`,
    });
  }

  game.guesses.push(guess);

  const correct = guess === game.secret;
  const feedback = correct ? 'correct' : guess < game.secret ? 'higher' : 'lower';
  const triesUsed = game.guesses.length;
  const triesRemaining = MAX_TRIES - triesUsed;
  const gameOver = correct || triesRemaining <= 0;

  let response = {
    feedback,
    triesUsed,
    triesRemaining,
    gameOver,
    won: correct,
  };

  if (gameOver) {
    const durationMs = Date.now() - game.startTime;
    const results = readResults();
    results.push({
      id: game.id,
      won: correct,
      tries: triesUsed,
      guesses: game.guesses,
      secret: game.secret,
      durationMs,
      timestamp: new Date().toISOString(),
    });
    writeResults(results);
    activeGames.delete(id);
    response.secret = game.secret;
    response.durationMs = durationMs;
  }

  res.json(response);
});

// Leaderboard: winners only, sorted by fewest tries, then fastest
app.get('/api/leaderboard', (req, res) => {
  const results = readResults();
  const winners = results
    .filter((r) => r.won)
    .sort((a, b) => a.tries - b.tries || a.durationMs - b.durationMs)
    .slice(0, 20)
    .map((r) => ({
      id: r.id,
      tries: r.tries,
      durationMs: r.durationMs,
      timestamp: r.timestamp,
    }));
  res.json(winners);
});

// Full results, for the organizer view
app.get('/api/results', (req, res) => {
  const results = readResults().sort(
    (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
  );
  res.json(results);
});

// CSV export, for organizers (opens fine in Excel)
app.get('/api/export.csv', (req, res) => {
  const results = readResults();
  const header = ['id', 'won', 'tries', 'guesses', 'secret', 'duration_seconds', 'timestamp'];
  const rows = results.map((r) => [
    csvSafe(r.id),
    r.won,
    r.tries,
    csvSafe(r.guesses.join('|')),
    r.secret,
    (r.durationMs / 1000).toFixed(1),
    r.timestamp,
  ]);
  const csv = [header.join(','), ...rows.map((row) => row.join(','))].join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="passcode-results.csv"');
  res.send(csv);
});

function csvSafe(value) {
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

app.listen(PORT, () => {
  console.log(`\nGuess the Passcode is running!`);
  console.log(`  Players:  http://localhost:${PORT}`);
  console.log(`  Organizer view: http://localhost:${PORT}/admin.html\n`);
});
