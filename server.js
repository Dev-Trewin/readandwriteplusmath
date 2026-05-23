require('dotenv').config();
const express = require('express');
const sql     = require('mssql');
const cors    = require('cors');

const app  = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.use(express.static('.'));   // serves index.html at http://localhost:3001

// ── SQL Server config ────────────────────────────────────────────────────────
const dbConfig = {
  server:   process.env.DB_SERVER   || 'localhost',
  port:     parseInt(process.env.DB_PORT || '1433'),
  database: process.env.DB_NAME     || 'WordWizards',
  user:     process.env.DB_USER     || 'sa',
  password: process.env.DB_PASSWORD || '',
  options: {
    encrypt:                process.env.DB_ENCRYPT === 'true',
    trustServerCertificate: true,
  },
};

let pool;
async function getPool() {
  if (!pool) pool = await sql.connect(dbConfig);
  return pool;
}

// ── PLAYERS ──────────────────────────────────────────────────────────────────

// POST /api/players  { username, avatar }
// Creates player if new, returns existing if not
app.post('/api/players', async (req, res) => {
  const { username, avatar = '🧙' } = req.body;
  if (!username) return res.status(400).json({ error: 'username required' });

  try {
    const db = await getPool();

    // Upsert: insert if not exists, return in both cases
    await db.request()
      .input('username', sql.NVarChar(50), username)
      .input('avatar',   sql.NVarChar(10), avatar)
      .query(`
        IF NOT EXISTS (SELECT 1 FROM Players WHERE Username = @username)
          INSERT INTO Players (Username, Avatar) VALUES (@username, @avatar);
      `);

    const result = await db.request()
      .input('username', sql.NVarChar(50), username)
      .query(`SELECT PlayerId, Username, Avatar, CreatedAt FROM Players WHERE Username = @username`);

    res.json(result.recordset[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ── SCORES ───────────────────────────────────────────────────────────────────

// POST /api/scores  { playerId, gameType, score, totalQuestions }
app.post('/api/scores', async (req, res) => {
  const { playerId, gameType, score, totalQuestions } = req.body;
  if (!playerId || !gameType) return res.status(400).json({ error: 'playerId and gameType required' });

  try {
    const db = await getPool();
    const result = await db.request()
      .input('playerId',       sql.Int,         playerId)
      .input('gameType',       sql.NVarChar(20), gameType)
      .input('score',          sql.Int,         score)
      .input('totalQuestions', sql.Int,         totalQuestions)
      .query(`
        INSERT INTO GameSessions (PlayerId, GameType, Score, TotalQuestions)
        OUTPUT INSERTED.*
        VALUES (@playerId, @gameType, @score, @totalQuestions)
      `);
    res.json(result.recordset[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/progress/:playerId
// Returns all sessions + summary stats per game type
app.get('/api/progress/:playerId', async (req, res) => {
  const { playerId } = req.params;
  try {
    const db = await getPool();

    // Last 20 sessions
    const sessions = await db.request()
      .input('playerId', sql.Int, parseInt(playerId))
      .query(`
        SELECT TOP 20 GameType, Score, TotalQuestions, Pct, PlayedAt
        FROM GameSessions
        WHERE PlayerId = @playerId
        ORDER BY PlayedAt DESC
      `);

    // Summary per game type
    const summary = await db.request()
      .input('playerId', sql.Int, parseInt(playerId))
      .query(`
        SELECT
          GameType,
          COUNT(*)             AS TimesPlayed,
          MAX(Pct)             AS BestPct,
          AVG(Pct)             AS AvgPct,
          MAX(PlayedAt)        AS LastPlayed,
          -- improvement: last Pct minus first Pct
          (
            SELECT TOP 1 Pct FROM GameSessions
            WHERE PlayerId = @playerId AND GameType = gs.GameType
            ORDER BY PlayedAt DESC
          ) -
          (
            SELECT TOP 1 Pct FROM GameSessions
            WHERE PlayerId = @playerId AND GameType = gs.GameType
            ORDER BY PlayedAt ASC
          ) AS ImprovementPct
        FROM GameSessions gs
        WHERE PlayerId = @playerId
        GROUP BY GameType
      `);

    res.json({ sessions: sessions.recordset, summary: summary.recordset });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/leaderboard
app.get('/api/leaderboard', async (req, res) => {
  try {
    const db = await getPool();
    const result = await db.request().query(`
      SELECT TOP 10 Username, Avatar, GameType, BestPct, TimesPlayed, LastPlayed
      FROM vw_BestScores
      ORDER BY BestPct DESC, TimesPlayed DESC
    `);
    res.json(result.recordset);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ── START ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🧙 Word Wizards server running → http://localhost:${PORT}`);
  console.log('   Open that URL in your browser to play.\n');
  // Test DB connection on startup
  getPool()
    .then(() => console.log('✅ SQL Server connected'))
    .catch(err => console.warn('⚠️  SQL Server not connected:', err.message, '\n   Game will run in offline mode.'));
});
