const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const chokidar = require('chokidar');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const QUESTIONS_DIR = path.join(__dirname, '../questions/Part5');
const ANSWERS_DIR   = path.join(__dirname, '../answers/Part5');

// --- REST API ---

app.get('/api/questions', (req, res) => {
  const files = fs.readdirSync(QUESTIONS_DIR)
    .filter(f => f.endsWith('.md'))
    .map(f => f.replace('.md', ''))
    .sort()
    .reverse();
  res.json(files);
});

app.get('/api/question/:ts', (req, res) => {
  const filePath = path.join(QUESTIONS_DIR, `${req.params.ts}.md`);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Not found' });
  res.type('text/plain').send(fs.readFileSync(filePath, 'utf8'));
});

app.get('/api/answer/:ts', (req, res) => {
  const filePath = path.join(ANSWERS_DIR, `${req.params.ts}.md`);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Not found' });
  res.type('text/plain').send(fs.readFileSync(filePath, 'utf8'));
});

app.patch('/api/question/:ts/answer', (req, res) => {
  const { answer } = req.body;
  if (!/^[A-D]$/.test(answer)) {
    return res.status(400).json({ error: 'Invalid answer. Must be A, B, C, or D.' });
  }

  const filePath = path.join(QUESTIONS_DIR, `${req.params.ts}.md`);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Not found' });

  let content = fs.readFileSync(filePath, 'utf8');
  const updated = content.replace(
    /\*\*回答\*\*: \([^)]*\)/,
    `**回答**: (${answer})`
  );

  if (updated === content) {
    return res.status(422).json({ error: '**回答** line not found in file' });
  }

  fs.writeFileSync(filePath, updated, 'utf8');
  res.json({ ok: true, answer });
});

// --- WebSocket ---

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

function broadcast(message) {
  const payload = JSON.stringify(message);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

function tsFromFile(filePath) {
  return path.basename(filePath, '.md');
}

// --- File Watchers ---

chokidar
  .watch(QUESTIONS_DIR, { ignoreInitial: true, awaitWriteFinish: { stabilityThreshold: 300 } })
  .on('add', filePath => {
    broadcast({ type: 'new-question', ts: tsFromFile(filePath) });
  });

chokidar
  .watch(ANSWERS_DIR, { ignoreInitial: true, awaitWriteFinish: { stabilityThreshold: 300 } })
  .on('add', filePath => {
    broadcast({ type: 'new-answer', ts: tsFromFile(filePath) });
  });

// --- Start ---

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`TOEIC web app running at http://localhost:${PORT}`);
});
