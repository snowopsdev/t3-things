#!/usr/bin/env node
// Status service for the T3 Things Car Thing app.
//
// Polls T3 Code on each configured host, Claude's plan usage, and Codex's
// rate-limit snapshots, then serves one condensed JSON document at
// GET /status.json (bearer token required). Read-only everywhere: it never
// refreshes OAuth tokens, so it cannot log out a running CLI.
//
// Config lives in ~/.config/agent-status/ (override with AGENT_STATUS_DIR):
//   display.token     bearer token the Car Thing sends
//   t3-<host>.token   orchestration:read T3 session token per host
//   config.json       optional overrides (see DEFAULTS)

import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { timingSafeEqual } from 'node:crypto';
import { mkdir, open, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const HOME = homedir();
const CONFIG_DIR = process.env.AGENT_STATUS_DIR ?? join(HOME, '.config/agent-status');
const CACHE_DIR = join(process.env.XDG_CACHE_HOME ?? join(HOME, '.cache'), 'agent-status');

const DEFAULTS = {
  // Published to the tailnet over HTTPS by `tailscale serve --bg --https=8449 http://127.0.0.1:8790`;
  // iOS App Transport Security refuses plain http to Tailscale IPs.
  listen: [{ host: '127.0.0.1', port: 8790 }],
  // T3 Code servers to watch. Add more in config.json, e.g.
  // { "name": "laptop", "url": "https://laptop.your-tailnet.ts.net:8443" }.
  t3Hosts: [{ name: 'desktop', url: 'http://127.0.0.1:3773' }],
  // Extra machines (ssh host aliases) whose ~/.codex/sessions logs are read over ssh.
  codexSshHosts: [],
  t3FallbackIntervalMs: 30_000,
  claudeIntervalMs: 5 * 60_000,
  codexIntervalMs: 60_000,
  codexSshIntervalMs: 5 * 60_000,
};

const config = { ...DEFAULTS, ...(await readJson(join(CONFIG_DIR, 'config.json')).catch(() => ({}))) };
const displayToken = (await readFile(join(CONFIG_DIR, 'display.token'), 'utf8')).trim();
// an empty token would let any `Authorization: Bearer ` request through.
if (displayToken.length < 16) throw new Error(`${join(CONFIG_DIR, 'display.token')} must hold at least 16 characters`);
const displayTokenBytes = Buffer.from(displayToken);

const state = {
  t3: Object.fromEntries(config.t3Hosts.map(h => [h.name, { ok: false, error: 'not polled yet', threads: [] }])),
  claude: { error: 'not polled yet' },
  codex: { error: 'not polled yet' },
  codexRemote: {},
};

// ---------- T3 ----------

// Mirrors the T3 Code sidebar (new flat sidebar with the Working shelf on):
// one list across hosts, subagent and archived threads hidden, sections
// Pinned → Active → Working → Snoozed → Settled, and T3's status pills.
const WORKING_RUNTIME = new Set(['preparing', 'queued', 'starting', 'running', 'waiting']);
const SETTLED_PREVIEW = 100;

const ts = v => (v ? Date.parse(v) || 0 : 0);
const latest = (...vals) => Math.max(0, ...vals.map(ts));

function runtimeStatus(t) {
  if (!t.latestRunId && !t.activeProviderThreadId) return null;
  return t.activityRunStatus ?? t.status ?? null;
}

// T3's pill precedence: approval, input, blocked wait, working, waiting, limited/failed, done (unread).
function threadPill(t) {
  const req = t.pendingRuntimeRequest;
  if (req && req.kind !== 'user_input' && req.kind !== 'auth_refresh') return { kind: 'approval', label: 'Approval' };
  if (req?.kind === 'user_input') return { kind: 'input', label: 'Input' };
  const rs = runtimeStatus(t);
  if (rs === 'running' && t.blockedOnThreadWait) return { kind: 'waiting', label: 'Waiting', since: t.latestRunStartedAt ?? null };
  if (WORKING_RUNTIME.has(rs)) {
    return { kind: 'working', label: t.goal ? 'Goal' : 'Working', since: t.activityRunStartedAt ?? t.latestRunStartedAt ?? null };
  }
  if (rs === 'idle') return { kind: 'waiting', label: 'Waiting', since: t.latestRunCompletedAt ?? null };
  if (rs === 'failed') return t.lastErrorClass === 'usage_limit' ? { kind: 'limited', label: 'Limited' } : { kind: 'failed', label: 'Failed' };
  if (t.latestRunCompletedAt && ts(t.latestRunCompletedAt) > ts(t.lastVisitedAt)) return { kind: 'done', label: 'Done' };
  return null;
}

function isSnoozed(t, now) {
  if (!t.snoozedUntil || ts(t.snoozedUntil) <= now) return false;
  // A pending request or a failure after snoozing wakes it early.
  if (t.pendingRuntimeRequest) return false;
  if (runtimeStatus(t) === 'failed' && ts(t.latestRunCompletedAt) > ts(t.snoozedAt)) return false;
  return true;
}

// "Needs attention": blocked on you (approval/input) or finished and unread.
const ATTENTION_RANK = { approval: 0, input: 1, done: 2 };

function threadSection(t, pill, now) {
  if (isSnoozed(t, now)) return 'snoozed';
  if (pill?.kind === 'approval' || pill?.kind === 'input') return 'attention';
  if (t.settledOverride === 'settled') return 'settled';
  if (pill?.kind === 'done') return 'attention';
  if (t.pinnedAt || t.pinOrderKey) return 'pinned';
  if (!t.pendingRuntimeRequest && WORKING_RUNTIME.has(runtimeStatus(t))) return 'working';
  return 'active';
}

// Sort keys per section, as in T3's comparators.
function sortKey(t, section, pill) {
  switch (section) {
    case 'attention':
      return `${ATTENTION_RANK[pill?.kind] ?? 9}:${String(1e15 - latest(t.updatedAt, t.latestRunCompletedAt)).padStart(16, '0')}`;
    case 'pinned':
      return t.pinOrderKey ?? `~${String(1e15 - ts(t.createdAt)).padStart(16, '0')}`;
    case 'working':
      return -latest(t.createdAt, t.latestUserAuthoredMessageAt ?? t.latestRunRequestedAt);
    case 'snoozed':
      return ts(t.snoozedUntil);
    case 'settled':
      return -(ts(t.settledAt) || latest(t.latestUserMessageAt, t.latestRunRequestedAt, t.latestRunStartedAt, t.latestRunCompletedAt) || ts(t.updatedAt));
    default:
      return -latest(t.createdAt, t.unsettledAt, t.latestRunRequestedAt, t.latestRunCompletedAt);
  }
}

// Each host keeps the raw T3 shell (threads and projects) and the condensed
// rows derived from it. A live WebSocket subscription keeps the raw shell
// current; while it's down, HTTP polling fills in.
const t3Raw = new Map(); // host name -> { threads: Map, projects: Map, sequence }

function rawFor(host) {
  if (!t3Raw.has(host.name)) t3Raw.set(host.name, { threads: new Map(), projects: new Map(), sequence: null });
  return t3Raw.get(host.name);
}

function condense(host, via) {
  const raw = rawFor(host);
  const now = Date.now();
  const threads = [];
  for (const t of raw.threads.values()) {
    if (t.archivedAt || t.deletedAt || t.lineage?.relationshipToParent === 'subagent') continue;
    const pill = threadPill(t);
    const section = threadSection(t, pill, now);
    threads.push({
      host: host.name,
      id: t.id,
      section,
      sortKey: sortKey(t, section, pill),
      title: clip(t.title ?? 'untitled', 70),
      project: clip(raw.projects.get(t.projectId)?.title ?? '', 40),
      provider: providerLabel(t.providerInstanceId),
      branch: t.branch ?? null,
      pill,
      dim: !pill || pill.kind === 'working' || pill.kind === 'waiting',
      age: new Date(ts(t.latestUserMessageAt) || ts(t.updatedAt) || now).toISOString(),
      snoozedUntil: t.snoozedUntil ?? null,
      settledAt: t.settledAt ?? null,
    });
  }
  state.t3[host.name] = { ok: true, error: null, via, polledAt: new Date().toISOString(), threads };
}

function replaceShell(host, snapshot) {
  const raw = rawFor(host);
  raw.threads = new Map((snapshot.threads ?? []).map(t => [t.id, t]));
  raw.projects = new Map((snapshot.projects ?? []).map(p => [p.id, p]));
  raw.sequence = snapshot.snapshotSequence ?? raw.sequence;
}

function markT3Down(host, err) {
  const prev = state.t3[host.name];
  state.t3[host.name] = { ...prev, ok: false, error: errMsg(err), failedAt: new Date().toISOString() };
}

async function t3Token(host) {
  return (await readFile(join(CONFIG_DIR, `t3-${host.name}.token`), 'utf8')).trim();
}

// ---- HTTP fallback ----

const t3InFlight = new Set();

async function pollT3(host) {
  if (t3InFlight.has(host.name)) return;
  t3InFlight.add(host.name);
  try {
    const res = await fetch(`${host.url}/api/orchestration/shell`, {
      headers: { authorization: `Bearer ${await t3Token(host)}`, 'x-t3-orchestration-protocol': '2' },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    replaceShell(host, await res.json());
    condense(host, 'poll');
  } catch (err) {
    markT3Down(host, err);
  } finally {
    t3InFlight.delete(host.name);
  }
}

// ---- Live stream ----
// T3's /ws speaks Effect RPC with JSON frames: we send one Request for
// orchestration.subscribeShell, then Ack every Chunk. Items are a snapshot
// followed by thread/project updates and removals.

const t3Streams = new Map(); // host name -> { live, ws }

function streamT3(host) {
  const st = { live: false, ws: null, backoff: 2_000, lastMessage: 0, requestId: 0 };
  t3Streams.set(host.name, st);
  let recomputeTimer = null;
  const recompute = () => {
    clearTimeout(recomputeTimer);
    recomputeTimer = setTimeout(() => condense(host, 'stream'), 150);
  };

  const connect = async () => {
    try {
      const tr = await fetch(`${host.url}/api/auth/websocket-ticket`, {
        method: 'POST',
        headers: { authorization: `Bearer ${await t3Token(host)}`, 'x-t3-orchestration-protocol': '2' },
        signal: AbortSignal.timeout(8_000),
      });
      if (!tr.ok) throw new Error(`ticket HTTP ${tr.status}`);
      const { ticket } = await tr.json();
      const wsUrl = `${host.url.replace(/^http/, 'ws')}/ws?orchestrationProtocol=2&wsTicket=${encodeURIComponent(ticket)}`;
      const ws = new WebSocket(wsUrl);
      st.ws = ws;
      ws.onopen = () => {
        st.lastMessage = Date.now();
        const raw = rawFor(host);
        const payload = st.live && raw.sequence != null ? { afterSequence: raw.sequence } : {};
        ws.send(JSON.stringify({ _tag: 'Request', id: String(++st.requestId), tag: 'orchestration.subscribeShell', payload, headers: [] }));
      };
      ws.onmessage = e => {
        st.lastMessage = Date.now();
        const text = typeof e.data === 'string' ? e.data : Buffer.from(e.data).toString('utf8');
        for (const msg of [].concat(JSON.parse(text))) {
          if (msg._tag === 'Chunk') {
            for (const item of msg.values ?? []) applyShellItem(host, item);
            ws.send(JSON.stringify({ _tag: 'Ack', requestId: msg.requestId }));
            st.live = true;
            st.backoff = 2_000;
            recompute();
          } else if (msg._tag === 'Exit' || msg._tag === 'Defect' || msg._tag === 'ClientProtocolError') {
            console.error(`t3 ${host.name}: stream ended (${msg._tag})`, JSON.stringify(msg).slice(0, 300));
            ws.close();
          }
        }
      };
      ws.onclose = () => scheduleReconnect('closed');
      ws.onerror = () => {}; // onclose follows
    } catch (err) {
      scheduleReconnect(errMsg(err));
    }
  };

  let reconnectTimer = null;
  const scheduleReconnect = reason => {
    if (reconnectTimer) return;
    st.live = false;
    st.ws = null;
    console.error(`t3 ${host.name}: stream down (${reason}); retrying in ${st.backoff / 1000}s`);
    pollT3(host); // keep the display current while reconnecting
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, st.backoff);
    st.backoff = Math.min(st.backoff * 2, 60_000);
  };

  // Keepalive: ping, and treat 60s of silence as a dead connection.
  setInterval(() => {
    if (!st.ws || st.ws.readyState !== WebSocket.OPEN) return;
    if (Date.now() - st.lastMessage > 60_000) return st.ws.close();
    st.ws.send(JSON.stringify({ _tag: 'Ping' }));
  }, 20_000);

  connect();
}

function applyShellItem(host, item) {
  const raw = rawFor(host);
  switch (item.kind) {
    case 'snapshot':
      // A thread-less snapshot carrying repository roots only refreshes projects.
      if (item.resolvedRepositoryIdentityRoots && !(item.snapshot?.threads?.length)) {
        for (const p of item.snapshot?.projects ?? []) raw.projects.set(p.id, p);
      } else {
        replaceShell(host, item.snapshot);
      }
      break;
    case 'thread.updated':
      if (item.location === 'archive') raw.threads.delete(item.thread.id);
      else raw.threads.set(item.thread.id, item.thread);
      break;
    case 'thread.removed':
      raw.threads.delete(item.threadId);
      break;
    case 'project.updated':
      raw.projects.set(item.project.id, item.project);
      break;
    case 'project.removed':
      raw.projects.delete(item.projectId);
      break;
  }
  if (typeof item.sequence === 'number') raw.sequence = Math.max(raw.sequence ?? 0, item.sequence);
}

function providerLabel(id) {
  if (!id) return 'agent';
  if (id.startsWith('claude')) return 'claude';
  if (id.startsWith('codex')) return 'codex';
  return id;
}

// ---------- Claude ----------

// The last good result is cached on disk so restarts neither lose the numbers
// nor re-poll an endpoint that rate-limits quickly.
const CLAUDE_CACHE = join(CACHE_DIR, 'claude.json');
let claudeBackoffUntil = 0;

async function loadClaudeCache() {
  const cached = await readJson(CLAUDE_CACHE).catch(() => null);
  if (cached?.polledAt) state.claude = { ...cached, error: null };
}

async function pollClaude() {
  const lastGood = state.claude.polledAt ? Date.parse(state.claude.polledAt) : 0;
  if (Date.now() < claudeBackoffUntil || Date.now() - lastGood < config.claudeIntervalMs - 5_000) return;
  try {
    const creds = await readJson(join(HOME, '.claude/.credentials.json'));
    const oauth = creds.claudeAiOauth;
    if (!oauth?.accessToken) throw new Error('no Claude OAuth credentials');
    if (oauth.expiresAt && oauth.expiresAt < Date.now()) {
      // Claude Code refreshes this itself on next use; never refresh here.
      throw new Error('Claude token expired; open Claude Code to refresh');
    }
    const res = await fetch('https://api.anthropic.com/api/oauth/usage', {
      headers: {
        authorization: `Bearer ${oauth.accessToken}`,
        'anthropic-beta': 'oauth-2025-04-20',
        'user-agent': 'agent-status/0.1 (car thing display)',
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 429) {
      const retryAfter = Number(res.headers.get('retry-after'));
      claudeBackoffUntil = Date.now() + (Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 15 * 60_000);
      throw new Error('usage rate-limited; showing last known values');
    }
    if (!res.ok) throw new Error(`usage HTTP ${res.status}`);
    const u = await res.json();
    state.claude = {
      error: null,
      plan: oauth.subscriptionType ?? null,
      fiveHour: window(u.five_hour),
      weekly: window(u.seven_day),
      polledAt: new Date().toISOString(),
    };
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(CLAUDE_CACHE, JSON.stringify(state.claude));
  } catch (err) {
    claudeBackoffUntil = Math.max(claudeBackoffUntil, Date.now() + config.claudeIntervalMs);
    state.claude = { ...state.claude, error: errMsg(err), failedAt: new Date().toISOString() };
  }
}

function window(w) {
  if (!w || typeof w.utilization !== 'number') return null;
  return { pct: Math.round(w.utilization), resetsAt: w.resets_at ?? null };
}

// ---------- Codex ----------

// Newest rollout file under ~/.codex/sessions/YYYY/MM/DD/.
async function newestRollout(root) {
  const pickNewest = async dir => {
    const names = (await readdir(dir).catch(() => [])).filter(n => /^\d+$/.test(n)).sort().reverse();
    return names.map(n => join(dir, n));
  };
  for (const y of await pickNewest(root)) {
    for (const m of await pickNewest(y)) {
      for (const d of await pickNewest(m)) {
        const files = (await readdir(d)).filter(f => f.endsWith('.jsonl'));
        if (!files.length) continue;
        const withTimes = await Promise.all(files.map(async f => ({ f: join(d, f), t: (await stat(join(d, f))).mtimeMs })));
        withTimes.sort((a, b) => b.t - a.t);
        return withTimes[0].f;
      }
    }
  }
  return null;
}

async function lastRateLimitLine(file) {
  const fh = await open(file, 'r');
  try {
    const { size } = await fh.stat();
    const len = Math.min(size, 512 * 1024);
    const buf = Buffer.alloc(len);
    await fh.read(buf, 0, len, size - len);
    const lines = buf.toString('utf8').split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].includes('"rate_limits"')) return lines[i];
    }
    return null;
  } finally {
    await fh.close();
  }
}

function parseCodexLine(line, source) {
  const j = JSON.parse(line);
  const rl = j.payload?.rate_limits ?? j.payload?.info?.rate_limits ?? j.rate_limits;
  if (!rl) return null;
  const win = w =>
    w && typeof w.used_percent === 'number'
      ? {
          pct: Math.round(w.used_percent),
          windowMinutes: w.window_minutes ?? null,
          resetsAt: w.resets_at ? new Date(w.resets_at * 1000).toISOString() : null,
        }
      : null;
  const windows = [win(rl.primary), win(rl.secondary)].filter(Boolean);
  return {
    plan: rl.plan_type ?? null,
    fiveHour: windows.find(w => w.windowMinutes && w.windowMinutes <= 360) ?? null,
    weekly: windows.find(w => w.windowMinutes && w.windowMinutes > 360) ?? null,
    observedAt: j.timestamp ?? null,
    source,
  };
}

async function pollCodexLocal() {
  try {
    const file = await newestRollout(join(HOME, '.codex/sessions'));
    if (!file) throw new Error('no Codex sessions yet');
    const line = await lastRateLimitLine(file);
    if (!line) throw new Error('no rate-limit data in latest Codex session');
    state.codex = { error: null, ...parseCodexLine(line, 'desktop') };
  } catch (err) {
    state.codex = { ...state.codex, error: errMsg(err) };
  }
}

// Same logic on another machine, via one ssh call with a tiny shell script.
const REMOTE_CODEX_SCRIPT = `f=$(ls -t "$(ls -d ~/.codex/sessions/*/*/* 2>/dev/null | sort | tail -1)"/*.jsonl 2>/dev/null | head -1); [ -n "$f" ] && tail -c 524288 "$f" | grep '"rate_limits"' | tail -1`;

async function pollCodexRemote(host) {
  try {
    const { stdout } = await execFileAsync('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=8', host, REMOTE_CODEX_SCRIPT], {
      timeout: 20_000,
      maxBuffer: 2 * 1024 * 1024,
    });
    const line = stdout.trim();
    state.codexRemote[host] = line ? { error: null, ...parseCodexLine(line, host) } : { error: 'no data' };
  } catch (err) {
    state.codexRemote[host] = { error: errMsg(err) };
  }
}

// Whichever machine saw Codex most recently has the freshest account-wide numbers.
function freshestCodex() {
  const candidates = [state.codex, ...Object.values(state.codexRemote)].filter(c => c && !c.error && c.observedAt);
  candidates.sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt));
  return candidates[0] ?? { error: state.codex.error ?? 'no Codex data' };
}

// ---------- Document ----------

function statusDocument() {
  const all = Object.values(state.t3).flatMap(h => h.threads ?? []);
  const sections = {};
  for (const name of ['attention', 'pinned', 'active', 'working', 'snoozed', 'settled']) {
    const rows = all
      .filter(t => t.section === name)
      .sort((a, b) => (a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : a.id.localeCompare(b.id)));
    sections[name] = {
      count: rows.length,
      threads: (name === 'settled' ? rows.slice(0, SETTLED_PREVIEW) : rows).map(({ sortKey, section, ...row }) => row),
    };
  }
  return {
    generatedAt: new Date().toISOString(),
    usage: { claude: state.claude, codex: freshestCodex() },
    t3: {
      hosts: Object.entries(state.t3).map(([name, h]) => ({ name, ok: h.ok, error: h.error, via: h.via ?? null, polledAt: h.polledAt ?? null })),
      sections,
    },
  };
}

// ---------- Server ----------

function authorized(req, url) {
  const header = req.headers.authorization ?? '';
  const given = header.startsWith('Bearer ') ? header.slice(7) : url.searchParams.get('token');
  if (typeof given !== 'string') return false;
  const bytes = Buffer.from(given);
  return bytes.length === displayTokenBytes.length && timingSafeEqual(bytes, displayTokenBytes);
}

function handler(req, res) {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/healthz') return send(res, 200, { ok: true });
  if (url.pathname !== '/status.json') return send(res, 404, { error: 'not found' });
  if (!authorized(req, url)) return send(res, 401, { error: 'unauthorized' });
  send(res, 200, statusDocument());
}

function send(res, code, body) {
  res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

// ---------- Helpers ----------

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

function clip(s, n) {
  s = String(s).replace(/\s+/g, ' ').trim();
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

function errMsg(err) {
  return err instanceof Error ? err.message : String(err);
}

function every(ms, fn) {
  fn();
  setInterval(fn, ms).unref?.();
}

// ---------- Main ----------

for (const host of config.t3Hosts) {
  streamT3(host);
  // Fallback poll only while the stream is down; also re-derive time-based state (snooze expiry).
  setInterval(() => {
    if (t3Streams.get(host.name)?.live) condense(host, 'stream');
    else pollT3(host);
  }, config.t3FallbackIntervalMs);
}
await loadClaudeCache();
every(60_000, pollClaude);
every(config.codexIntervalMs, pollCodexLocal);
for (const host of config.codexSshHosts) every(config.codexSshIntervalMs, () => pollCodexRemote(host));

for (const { host, port } of config.listen) {
  createServer(handler).listen(port, host, () => console.log(`agent-status listening on http://${host}:${port}`));
}
