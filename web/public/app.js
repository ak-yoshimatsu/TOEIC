let currentTs = null;
let answered = false;

// --- WebSocket ---

const ws = new WebSocket(`ws://${location.host}`);

ws.addEventListener('message', async (event) => {
  const msg = JSON.parse(event.data);

  if (msg.type === 'new-question') {
    await loadQuestion(msg.ts);
    await refreshLog();
  }

  if (msg.type === 'new-answer' && msg.ts === currentTs) {
    await loadAnswer(msg.ts);
  }
});

ws.addEventListener('close', () => {
  document.getElementById('status-msg').textContent =
    'サーバーとの接続が切れました。ページを更新してください。';
});

// --- Init ---

async function init() {
  const questions = await fetch('/api/questions').then(r => r.json());

  if (questions.length === 0) {
    document.getElementById('empty-state').style.display = 'block';
    document.getElementById('question-section').style.display = 'none';
    await refreshLog();
    return;
  }

  await loadQuestion(questions[0]);

  const answerRes = await fetch(`/api/answer/${questions[0]}`);
  if (answerRes.ok) {
    renderAnswer(await answerRes.text());
  }

  await refreshLog();
}

init();

// --- Question ---

function parseQuestion(md) {
  const lines = md.split('\n');

  const themeLine = lines.find(l => l.startsWith('**テーマ**:'));
  const theme = themeLine ? themeLine.replace('**テーマ**:', '').trim() : '';

  const choiceRegex = /^\(([A-D])\) (.+)$/;
  const choices = lines
    .map(l => l.match(choiceRegex))
    .filter(Boolean)
    .map(m => ({ letter: m[1], text: m[2].trim() }));

  const firstHrIdx = lines.findIndex(l => l.trim() === '---');
  const firstChoiceIdx = lines.findIndex(l => choiceRegex.test(l));
  const sentence = lines
    .slice(firstHrIdx + 1, firstChoiceIdx)
    .join('\n')
    .trim();

  const answerLine = lines.find(l => l.startsWith('**回答**:'));
  const existingAnswer = answerLine
    ? (answerLine.match(/\(([A-D])\)/) || [])[1] || null
    : null;

  return { theme, sentence, choices, existingAnswer };
}

async function loadQuestion(ts) {
  currentTs = ts;
  answered = false;

  const md = await fetch(`/api/question/${ts}`).then(r => r.text());
  const { theme, sentence, choices, existingAnswer } = parseQuestion(md);

  document.getElementById('question-theme').textContent = `テーマ: ${theme}`;
  document.getElementById('question-body').textContent =
    sentence.replace('-------', '________');

  const form = document.getElementById('choices-form');
  form.innerHTML = '';
  choices.forEach(({ letter, text }) => {
    const label = document.createElement('label');
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'choice';
    radio.value = letter;

    if (existingAnswer === letter) {
      radio.checked = true;
    }
    if (existingAnswer) {
      radio.disabled = true;
    }

    const span = document.createElement('span');
    span.textContent = `(${letter}) ${text}`;
    label.append(radio, span);
    form.appendChild(label);
  });

  // Enable submit button change listener
  form.querySelectorAll('input[type="radio"]').forEach(r => {
    r.addEventListener('change', () => {
      document.getElementById('submit-btn').disabled = false;
    });
  });

  const submitBtn = document.getElementById('submit-btn');
  const statusMsg = document.getElementById('status-msg');

  if (existingAnswer) {
    submitBtn.disabled = true;
    answered = true;
    statusMsg.textContent = `回答済み: (${existingAnswer}) - Claude Code で /answer を実行してください`;
  } else {
    submitBtn.disabled = true;
    answered = false;
    statusMsg.textContent = '';
  }

  document.getElementById('answer-section').hidden = true;
  document.getElementById('question-section').style.display = '';
  document.getElementById('empty-state').style.display = 'none';

  // Highlight active log item
  document.querySelectorAll('#log-list a').forEach(a => {
    a.classList.toggle('active', a.dataset.ts === ts);
  });
}

// --- Submit ---

document.getElementById('submit-btn').addEventListener('click', async () => {
  const selected = document.querySelector('input[name="choice"]:checked');
  if (!selected) return;

  const answer = selected.value;
  const res = await fetch(`/api/question/${currentTs}/answer`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ answer }),
  });

  if (res.ok) {
    document.querySelectorAll('input[name="choice"]').forEach(r => r.disabled = true);
    document.getElementById('submit-btn').disabled = true;
    document.getElementById('status-msg').textContent =
      `回答しました: (${answer}) - Claude Code で /answer を実行してください`;
    answered = true;
  } else {
    document.getElementById('status-msg').textContent = '送信に失敗しました';
  }
});

// --- Answer ---

async function loadAnswer(ts) {
  const res = await fetch(`/api/answer/${ts}`);
  if (!res.ok) return;
  renderAnswer(await res.text());
}

function renderAnswer(md) {
  const section = document.getElementById('answer-section');
  section.hidden = false;
  document.getElementById('answer-body').innerHTML = marked.parse(md);
}

// --- Log ---

async function refreshLog() {
  const timestamps = await fetch('/api/questions').then(r => r.json());
  const list = document.getElementById('log-list');
  list.innerHTML = '';

  timestamps.forEach(ts => {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = '#';
    a.textContent = formatTs(ts);
    a.dataset.ts = ts;
    if (ts === currentTs) a.classList.add('active');

    a.addEventListener('click', async (e) => {
      e.preventDefault();
      await loadQuestion(ts);
      const answerRes = await fetch(`/api/answer/${ts}`);
      if (answerRes.ok) {
        renderAnswer(await answerRes.text());
      }
    });

    li.appendChild(a);
    list.appendChild(li);
  });
}

function formatTs(ts) {
  // "20260420-085650" -> "2026-04-20 08:56"
  const [date, time] = ts.split('-');
  return `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)} ${time.slice(0, 2)}:${time.slice(2, 4)}`;
}
