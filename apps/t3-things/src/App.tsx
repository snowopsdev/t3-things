import { BridgethingClient, type NetFetchReply } from '@bridgething/client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertBanner } from './AlertBanner';
import { diffAlerts, mergeAlerts, threadKey, type Alert, type AlertKind, type Seen } from './alerts';
import { daemonUrl } from './daemon';
import { createDemo } from './demo';
import claudeLogo from './icons/claude.svg';
import codexLogo from './icons/codex.svg';
import { ThreadList, settledPaging, type GroupName, type Sections, type Thread } from './Threads';

const POLL_MS = 5_000;
const DEFAULT_URL = import.meta.env.VITE_AGENT_STATUS_URL ?? '';
const DEFAULT_TOKEN = import.meta.env.VITE_AGENT_STATUS_TOKEN ?? '';
const BOOST_MS = 15_000;
// ?demo shows made-up data instead of polling the status service.
const DEMO = new URLSearchParams(window.location.search).has('demo');
const SAMPLE_THREAD: Thread = {
  host: 'desktop',
  id: 'sample',
  title: 'Sample thread for a test alert',
  project: 'T3 Things',
  provider: 'claude',
  branch: null,
  pill: null,
  dim: false,
  age: new Date().toISOString(),
  snoozedUntil: null,
  settledAt: null,
};

type Window = { pct: number; resetsAt: string | null } | null;
type Usage = { error: string | null; plan?: string | null; fiveHour?: Window; weekly?: Window; observedAt?: string; polledAt?: string };
type Status = {
  generatedAt: string;
  usage: { claude: Usage; codex: Usage };
  t3: {
    hosts: { name: string; ok: boolean; error: string | null }[];
    sections: Sections;
  };
};

export default function App() {
  // Demo mode runs off-device (screenshots, the playable demo), so no daemon to reach.
  const client = useMemo(() => new BridgethingClient({ url: daemonUrl(), autoConnect: !DEMO }), []);
  const demo = useMemo(() => (DEMO ? createDemo() : null), []);
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastOk, setLastOk] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const settings = useRef({ url: DEFAULT_URL, token: DEFAULT_TOKEN, attention: true, finished: true, brighten: true });
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const alertsRef = useRef(alerts);
  alertsRef.current = alerts;
  const seen = useRef<Seen>(new Map());
  const brightness = useBrightnessBoost(client);
  const listRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState<GroupName | null>(null);
  const [settledShown, setSettledShown] = useState(settledPaging.first);
  const toggle = useCallback((g: GroupName) => {
    setOpen(o => (o === g ? null : g));
    setSettledShown(settledPaging.first);
    listRef.current?.scrollTo({ top: 0 });
  }, []);

  const show = useCallback(
    (next: Status) => {
      const { attention, finished, brighten } = settings.current;
      const fresh = diffAlerts(seen.current, next.t3.sections, { attention, finished }, Date.now());
      setAlerts(a => mergeAlerts(a, fresh, seen.current));
      if (fresh.length && brighten) brightness.boost();
      setStatus(next);
      setError(null);
      setLastOk(Date.now());
    },
    [brightness],
  );

  const refresh = useCallback(async () => {
    if (demo) return show(demo.status(Date.now()));
    const { url, token } = settings.current;
    if (!url || !token) {
      setError('set the status service URL and token in the companion app');
      return;
    }
    try {
      const res = await client.net.fetch({
        request: {
          url: `${url.replace(/\/$/, '')}/status.json`,
          method: 'GET',
          headers: [{ name: 'authorization', value: `Bearer ${token}` }],
          body: null,
          timeoutMs: 12_000,
          redirect: 'follow',
        },
      });
      if (!res.ok) {
        setError(`${res.kind === 'domain' ? 'phone network' : 'request'} error: ${describeNetError(res.error)}`);
        return;
      }
      const reply = res.response as NetFetchReply;
      if (reply.response.status === 401) throw new Error('status service rejected the token');
      if (reply.response.status >= 400) throw new Error(`status service returned ${reply.response.status}`);
      const text = new TextDecoder().decode(new Uint8Array(reply.response.body as unknown as number[]));
      show(JSON.parse(text));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [client, demo, show]);

  const dismiss = useCallback(() => {
    setAlerts([]);
    brightness.restore();
  }, [brightness]);

  // Nothing left to show once every alerted thread has moved on.
  useEffect(() => {
    if (!alerts.length) brightness.restore();
  }, [alerts, brightness]);

  // Lets a test alert be raised over DevTools: t3things.testAlert('approval').
  useEffect(() => {
    (window as unknown as { t3things: unknown }).t3things = {
      testAlert(kind: AlertKind = 'approval') {
        const all = status ? Object.values(status.t3.sections).flatMap(s => s.threads) : [];
        const matches = (p: Thread['pill']) => p?.kind === kind || (kind === 'failed' && p?.kind === 'limited');
        const t = all.find(x => matches(x.pill)) ?? all[0] ?? SAMPLE_THREAD;
        setAlerts(a => [{ key: threadKey(t), kind, thread: t, at: Date.now() }, ...a.filter(x => x.key !== threadKey(t))]);
        if (settings.current.brighten) brightness.boost();
      },
      // Demo mode only: play the next scripted thread change, or start over.
      demo: demo && {
        advance() {
          demo.advance();
          refresh();
        },
        reset() {
          demo.reset();
          seen.current.clear();
          setAlerts([]);
          setOpen(null);
          listRef.current?.scrollTo({ top: 0 });
          refresh();
        },
      },
    };
  }, [status, brightness, demo, refresh]);

  // Load config overrides, then poll.
  useEffect(() => {
    let timer: ReturnType<typeof setInterval>;
    const apply = (key: string, value: string | null | undefined) => {
      const v = (value ?? '').trim();
      if (key === 'serviceUrl') settings.current.url = v || DEFAULT_URL;
      if (key === 'token') settings.current.token = v || DEFAULT_TOKEN;
      if (key === 'alertAttention') settings.current.attention = v !== 'false';
      if (key === 'alertFinished') settings.current.finished = v !== 'false';
      if (key === 'alertBrighten') settings.current.brighten = v !== 'false';
    };
    (async () => {
      const all = DEMO ? null : await client.config.list().catch(() => null);
      if (all?.ok) for (const e of all.response.entries ?? []) apply(e.key, e.value);
      refresh();
      timer = setInterval(refresh, POLL_MS);
    })();
    const offConfig = client.config.onChanged(c => {
      apply(c.key, c.value);
      refresh();
    });
    return () => {
      clearInterval(timer);
      offConfig();
    };
  }, [client, refresh]);

  // Clock for relative times.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(t);
  }, []);

  // Rotary wheel scrolls the thread list; wheel click refreshes; presets 1-4 open Attention/Working/Snoozed/Settled; Back closes them.
  useEffect(() => {
    const onWheel = (e: WheelEvent) => listRef.current?.scrollBy({ top: (e.deltaX || e.deltaY) * 1.5, behavior: 'smooth' });
    const onKey = (e: KeyboardEvent) => {
      // With an alert up, a button only dismisses it; 1 also jumps to Attention.
      if (alertsRef.current.length) {
        dismiss();
        if (e.key === '1') setOpen('attention');
        return;
      }
      if (e.key === 'Enter') refresh();
      if (e.key === 'Escape') setOpen(null);
      const group = ({ '1': 'attention', '2': 'working', '3': 'snoozed', '4': 'settled' } as const)[e.key as '1' | '2' | '3' | '4'];
      if (group) toggle(group);
    };
    window.addEventListener('wheel', onWheel);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKey);
    };
  }, [refresh, toggle, dismiss]);

  const sections = status?.t3.sections;
  const downHosts = status?.t3.hosts.filter(h => !h.ok) ?? [];

  return (
    <div className="relative flex h-full w-full flex-col gap-3 bg-bg p-4 text-off-white">
      {alerts.length > 0 && <AlertBanner alerts={alerts} onDismiss={dismiss} />}
      <div className="grid grid-cols-2 gap-3">
        <UsageCard name="Claude" logo={claudeLogo} usage={status?.usage.claude} now={now} />
        <UsageCard name="Codex" logo={codexLogo} usage={status?.usage.codex} now={now} />
      </div>

      <div className="flex items-center gap-3 font-mono text-hint uppercase tracking-[0.15em]">
        <span className="text-soft">T3 threads</span>
        <span className="ml-auto normal-case tracking-normal">
          {error ? (
            <span className="text-warn">{error}</span>
          ) : downHosts.length ? (
            <span className="text-warn">{downHosts.map(h => h.name).join(', ')} unreachable</span>
          ) : lastOk ? (
            <span className="text-dim">updated {ago(lastOk, now)}</span>
          ) : (
            <span className="text-dim">connecting…</span>
          )}
        </span>
      </div>

      {sections && (
        <ThreadList
          sections={sections}
          open={open}
          settledShown={settledShown}
          onToggle={toggle}
          onShowMore={() => setSettledShown(n => n + settledPaging.step)}
          listRef={listRef}
          now={now}
        />
      )}
    </div>
  );
}

// Turns the backlight to full while an alert is fresh, then puts back whatever
// mode and level were there before.
function useBrightnessBoost(client: BridgethingClient) {
  return useMemo(() => {
    let saved: { mode: 'auto' | 'manual'; level: number } | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Bumped by restore so a boost still waiting on stateGet gives up.
    let generation = 0;
    const restore = () => {
      clearTimeout(timer);
      generation++;
      if (!saved) return;
      const { mode, level } = saved;
      saved = null;
      if (mode === 'auto') client.hardware.displaySetMode({ mode: 'auto' }).catch(() => {});
      else client.hardware.displaySetLevel({ level }).catch(() => {});
    };
    const boost = async () => {
      clearTimeout(timer);
      timer = setTimeout(restore, BOOST_MS);
      if (saved) return;
      const mine = ++generation;
      const res = await client.hardware.stateGet().catch(() => null);
      if (!res?.ok || mine !== generation) return;
      saved = { mode: res.response.state.brightness.mode, level: res.response.state.brightness.level };
      await client.hardware.displaySetMode({ mode: 'manual' }).catch(() => {});
      await client.hardware.displaySetLevel({ level: 1 }).catch(() => {});
    };
    // Leaving the app mid-boost should not strand the screen at full.
    window.addEventListener('pagehide', restore);
    return { boost, restore };
  }, [client]);
}

function UsageCard({ name, logo, usage, now }: { name: string; logo: string; usage: Usage | undefined; now: number }) {
  // Codex reports when its numbers were observed; Claude only needs an age when its last poll failed.
  const asOf = usage?.observedAt ?? (usage?.error ? usage?.polledAt : undefined);
  const stale = asOf ? now - Date.parse(asOf) > 30 * 60_000 || !!usage?.error : false;
  return (
    <div className="flex flex-col gap-2 border border-rule bg-screen px-4 py-3">
      <div className="flex items-center gap-2">
        <img src={logo} alt="" className="h-6 w-6" />
        <span className="font-display text-title font-medium tracking-display">{name}</span>
        {usage?.plan && <span className="font-mono text-eyebrow uppercase tracking-[0.2em] text-dim">{usage.plan}</span>}
        {asOf && (
          <span className={`ml-auto font-mono text-eyebrow ${stale ? 'text-experimental' : 'text-dim'}`}>
            as of {ago(Date.parse(asOf), now)}
          </span>
        )}
      </div>
      {usage?.error && !usage.fiveHour && !usage.weekly ? (
        <div className="text-hint text-warn">{usage.error}</div>
      ) : (
        <>
          <Bar label="5 hour" w={usage?.fiveHour ?? null} now={now} />
          <Bar label="weekly" w={usage?.weekly ?? null} now={now} />
        </>
      )}
    </div>
  );
}

function Bar({ label, w, now }: { label: string; w: Window; now: number }) {
  if (!w) {
    return (
      <div className="flex items-center gap-3 font-mono text-hint text-dim">
        <span className="w-14">{label}</span>
        <span>n/a</span>
      </div>
    );
  }
  const color = w.pct >= 90 ? 'bg-err' : w.pct >= 70 ? 'bg-experimental' : 'bg-accent';
  return (
    <div className="flex items-center gap-3 font-mono text-hint">
      <span className="w-14 text-soft">{label}</span>
      <div className="h-2 flex-1 bg-neutral-soft">
        <div className={`h-full ${color}`} style={{ width: `${Math.min(100, Math.max(2, w.pct))}%` }} />
      </div>
      <span className="w-10 text-right text-near">{w.pct}%</span>
      <span className="w-24 text-right text-dim">{w.resetsAt ? `resets ${until(Date.parse(w.resetsAt), now)}` : ''}</span>
    </div>
  );
}

// Net errors arrive as tagged unions; keep the tag and any message, compactly.
function describeNetError(error: unknown): string {
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error).replace(/[{}"]/g, '').slice(0, 120);
  } catch {
    return String(error);
  }
}

function ago(t: number, now: number): string {
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

function until(t: number, now: number): string {
  const m = Math.max(0, Math.round((t - now) / 60_000));
  if (m < 60) return `${m}m`;
  if (m < 48 * 60) return `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}`;
  return `${Math.round(m / 1440)}d`;
}
