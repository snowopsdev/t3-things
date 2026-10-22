// T3 thread list, laid out like the T3 Code sidebar: Pinned and Active cards,
// then collapsible Working / Snoozed / Settled groups at the bottom.
import type { RefObject } from 'react';
import claudeLogo from './icons/claude.svg';
import codexLogo from './icons/codex.svg';

export type PillKind = 'approval' | 'input' | 'waiting' | 'working' | 'limited' | 'failed' | 'done';
export type Pill = { kind: PillKind; label: string; since?: string | null } | null;
export type Thread = {
  host: string;
  id: string;
  title: string;
  project: string;
  provider: string;
  branch: string | null;
  pill: Pill;
  dim: boolean;
  age: string;
  snoozedUntil: string | null;
  settledAt: string | null;
};
export type SectionName = 'attention' | 'pinned' | 'active' | 'working' | 'snoozed' | 'settled';
export type Sections = Record<SectionName, { count: number; threads: Thread[] }>;
export type GroupName = 'attention' | 'working' | 'snoozed' | 'settled';

const SETTLED_FIRST = 10;
const SETTLED_STEP = 25;

// Colors follow T3's pills: info, muted, warning-foreground, indigo, warning, error, success.
const PILL_COLOR: Record<PillKind, string> = {
  working: 'text-accent',
  waiting: 'text-soft',
  approval: 'text-experimental',
  input: 'text-[#a5b4fc]',
  limited: 'text-experimental',
  failed: 'text-warn',
  done: 'text-ok',
};

// The groups live in a footer pinned to the bottom, like T3's sidebar. On this
// small screen an open group takes over the list area; closing it returns to
// the Pinned/Active cards.
export function ThreadList(props: {
  sections: Sections;
  open: GroupName | null;
  settledShown: number;
  onToggle: (group: GroupName) => void;
  onShowMore: () => void;
  listRef: RefObject<HTMLDivElement | null>;
  now: number;
}) {
  const { sections, open, settledShown, onToggle, onShowMore, listRef, now } = props;
  const pinned = new Set(sections.pinned.threads);
  const cards = [...sections.pinned.threads, ...sections.active.threads];
  const settled = sections.settled.threads.slice(0, settledShown);
  const hiddenSettled = sections.settled.threads.length - settled.length;
  const groups: { name: GroupName; label: string; hint: string }[] = [
    { name: 'attention', label: 'Attention', hint: '1' },
    { name: 'working', label: 'Working', hint: '2' },
    { name: 'snoozed', label: 'Snoozed', hint: '3' },
    { name: 'settled', label: 'Settled', hint: '4' },
  ];

  return (
    <>
      <div ref={listRef} className="flex min-h-0 flex-1 flex-col overflow-y-auto border-t border-rule">
        {open === null &&
          (cards.length ? (
            cards.map(t => <Card key={`${t.host}:${t.id}`} t={t} now={now} pinned={pinned.has(t)} />)
          ) : (
            <div className="py-6 text-center text-body text-dim">no active threads</div>
          ))}
        {open === 'attention' &&
          (sections.attention.threads.length ? (
            sections.attention.threads.map(t => <Card key={`${t.host}:${t.id}`} t={t} now={now} />)
          ) : (
            <div className="py-6 text-center text-body text-dim">nothing needs you</div>
          ))}
        {open === 'working' && sections.working.threads.map(t => <Card key={`${t.host}:${t.id}`} t={t} now={now} />)}
        {open === 'snoozed' &&
          sections.snoozed.threads.map(t => (
            <Slim key={`${t.host}:${t.id}`} t={t} right={t.snoozedUntil ? until(Date.parse(t.snoozedUntil), now) : ''} rightCls="text-accent" />
          ))}
        {open === 'settled' && (
          <>
            {settled.map(t => (
              <Slim key={`${t.host}:${t.id}`} t={t} right={t.settledAt ? short(Date.parse(t.settledAt), now) : ''} rightCls="text-dim" />
            ))}
            {hiddenSettled > 0 && (
              <button className="w-full py-2 text-left font-mono text-hint text-soft" onClick={onShowMore}>
                Show {Math.min(hiddenSettled, SETTLED_STEP)} more
              </button>
            )}
          </>
        )}
      </div>
      <div className="flex gap-1 border-t border-rule pt-1.5">
        {groups
          .filter(g => g.name === 'settled' || g.name === 'attention' || sections[g.name].count > 0)
          .map(g => {
            const isOpen = open === g.name;
            const alert = g.name === 'attention' && sections.attention.count > 0;
            return (
              <button
                key={g.name}
                onClick={() => onToggle(g.name)}
                className={`flex items-center gap-1.5 px-2 py-1 font-mono text-hint ${isOpen ? 'bg-neutral-soft text-near' : alert ? 'bg-experimental-soft text-experimental' : 'text-soft'}`}>
                <span className={`inline-block h-1.5 w-1.5 border-r border-b border-current text-dim ${isOpen ? 'rotate-45' : '-rotate-45'}`} />
                {isOpen ? g.label : `${g.label} (${sections[g.name].count})`}
                <span className="text-eyebrow text-dim">{g.hint}</span>
              </button>
            );
          })}
      </div>
    </>
  );
}

export const settledPaging = { first: SETTLED_FIRST, step: SETTLED_STEP };

function Card({ t, now, pinned = false }: { t: Thread; now: number; pinned?: boolean }) {
  return (
    <div className={`border-b border-rule px-1 py-1.5 ${t.dim ? 'opacity-65' : ''}`}>
      <div className="flex items-center gap-2 font-mono text-eyebrow text-dim">
        {pinned && <span className="text-soft">pinned</span>}
        <span className="truncate">{t.project || 'No project'}</span>
        <span className="ml-auto shrink-0">
          <PillOrAge t={t} now={now} />
        </span>
      </div>
      <div className="truncate text-row text-near">{t.title}</div>
      <div className="flex gap-2 truncate font-mono text-eyebrow text-dim">
        {t.branch && <span className="truncate">{tailTruncate(t.branch, 40)}</span>}
        <span className="shrink-0">{t.host}</span>
        <ProviderIcon provider={t.provider} />
      </div>
    </div>
  );
}

function PillOrAge({ t, now }: { t: Thread; now: number }) {
  if (!t.pill) return <span className="text-dim">{short(Date.parse(t.age), now)}</span>;
  const elapsed = (t.pill.kind === 'working' || t.pill.kind === 'waiting') && t.pill.since ? ` ${duration(now - Date.parse(t.pill.since))}` : '';
  return (
    <span className={`${PILL_COLOR[t.pill.kind]} font-medium`}>
      {t.pill.label}
      {elapsed}
    </span>
  );
}

function Slim({ t, right, rightCls }: { t: Thread; right: string; rightCls: string }) {
  return (
    <div className="flex items-center gap-2 px-1 py-1.5 opacity-65">
      <span className="truncate text-body text-soft">{t.title}</span>
      <span className="shrink-0 font-mono text-eyebrow text-dim">{t.host}</span>
      <span className={`ml-auto shrink-0 font-mono text-eyebrow ${rightCls}`}>{right}</span>
    </div>
  );
}

function ProviderIcon({ provider }: { provider: string }) {
  const src = provider === 'claude' ? claudeLogo : provider === 'codex' ? codexLogo : null;
  return src ? <img src={src} alt={provider} className="h-3 w-3 shrink-0 self-center" /> : <span className="shrink-0">{provider}</span>;
}

// T3's branch display keeps the tail, which carries the distinguishing part.
function tailTruncate(s: string, n: number): string {
  return s.length > n ? `…${s.slice(s.length - n + 1)}` : s;
}

// "now", "5m", "3h", "2d" like T3's sidebar.
function short(t: number, now: number): string {
  const s = Math.max(0, (now - t) / 1000);
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

function until(t: number, now: number): string {
  return short(now - (t - now), now);
}

// "42s", "7m", "1h 5m" like T3's working timer.
function duration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}`;
}
