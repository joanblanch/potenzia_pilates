import fs from 'node:fs';
import { readFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as rules from './lib/rules.js';
import { createSeed } from './lib/seed.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, 'public');
const DB_FILE = path.join(ROOT, 'data', 'db.json');
const PORT = Number(process.env.PORT) || 3210;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };

let state = load();

function load() {
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch {
    const seeded = createSeed(new Date());
    save(seeded);
    return seeded;
  }
}

function save(next) {
  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
  fs.writeFileSync(DB_FILE, JSON.stringify(next, null, 2));
}

const now = () => (state.demoNow ? new Date(state.demoNow) : new Date());
const clockInfo = () => ({ now: rules.toLocalIso(now()), demo: Boolean(state.demoNow) });

// Cada cambio se aplica sobre una copia: si una regla falla, el estado queda como estaba.
function mutate(change) {
  const draft = structuredClone(state);
  const result = change(draft);
  state = draft;
  save(state);
  return result;
}

const routes = {
  'GET /api/users': () => ({ owner: state.owner, members: state.members.map(({ id, name }) => ({ id, name })) }),
  'GET /api/clock': () => clockInfo(),
  'GET /api/week': (query) => rules.memberView(state, query.get('member'), now()),
  'GET /api/owner': () => rules.ownerView(state, now()),
  'POST /api/book': (_, body) => mutate((s) => rules.book(s, body.memberId, body.classId, now())),
  'POST /api/cancel': (_, body) => mutate((s) => rules.cancel(s, body.memberId, body.classId, now())),
  'POST /api/leave-waitlist': (_, body) => mutate((s) => rules.leaveWaitlist(s, body.memberId, body.classId, now())),
  'POST /api/notices/seen': (_, body) => mutate((s) => rules.markNoticesSeen(s, body.memberId)),
  'POST /api/clock': (_, body) => {
    if (body.now && Number.isNaN(new Date(body.now).getTime())) throw new rules.RuleError('Hora no válida.');
    mutate((s) => { s.demoNow = body.now || null; });
    return clockInfo();
  },
  'POST /api/reset': () => {
    state = createSeed(new Date());
    save(state);
    return { ok: true };
  },
};

async function readJson(req) {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

async function serveStatic(pathname, res) {
  const file = path.normalize(path.join(PUBLIC, pathname === '/' ? 'index.html' : pathname));
  if (!file.startsWith(PUBLIC + path.sep)) {
    res.writeHead(404);
    return res.end();
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('No encontrado');
  }
}

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const handler = routes[`${req.method} ${url.pathname}`];
    if (!handler) return serveStatic(url.pathname, res);
    try {
      const body = req.method === 'POST' ? await readJson(req) : {};
      sendJson(res, 200, handler(url.searchParams, body));
    } catch (error) {
      if (error instanceof rules.RuleError) return sendJson(res, 400, { error: error.message });
      console.error(error);
      sendJson(res, 500, { error: 'Error inesperado del servidor.' });
    }
  })
  .listen(PORT, () => console.log(`Núcleo Pilates en http://localhost:${PORT}`));
