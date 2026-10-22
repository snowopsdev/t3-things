// Made-up status for demo mode (open the app with ?demo). Times are relative
// to now so ages, timers, and resets read naturally whenever it runs.
// createDemo().advance() plays the next scripted change, so a demo can show
// threads finishing or stopping for approval and the alerts that follow.
import type { PillKind, SectionName, Thread } from './Threads';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

const LABEL: Record<PillKind, string> = {
  approval: 'Approval',
  input: 'Input',
  waiting: 'Waiting',
  working: 'Working',
  limited: 'Limited',
  failed: 'Failed',
  done: 'Done',
};

type Seed = {
  title: string;
  project: string;
  provider?: 'claude' | 'codex';
  host?: string;
  branch?: string;
  pill?: PillKind;
  label?: string;
  // Minutes ago the pill started, or the thread last changed.
  ago: number;
  snoozeFor?: number;
};

const SEEDS: Record<SectionName, Seed[]> = {
  attention: [
    { title: 'Migrate billing webhooks to the v2 API', project: 'ledger-api', branch: 'feat/webhooks-v2', pill: 'approval', ago: 1 },
    { title: 'Pick a chart library for the usage dashboard', project: 'atlas-web', provider: 'codex', host: 'laptop', pill: 'input', ago: 6 },
    { title: 'Fix the flaky checkout end-to-end test', project: 'storefront', branch: 'fix/checkout-e2e', pill: 'done', ago: 14 },
  ],
  pinned: [{ title: 'Weekly dependency upgrades', project: 'infra', provider: 'codex', ago: 2 * 60 }],
  active: [
    { title: 'Write the onboarding guide', project: 'atlas-web', host: 'laptop', branch: 'docs/onboarding', ago: 25 },
    { title: 'Bump Node to 24 in CI', project: 'storefront', provider: 'codex', pill: 'failed', ago: 48 },
    { title: 'Profile slow search queries', project: 'ledger-api', ago: 3 * 60 },
  ],
  working: [
    { title: 'Refactor the auth middleware', project: 'ledger-api', branch: 'refactor/auth', pill: 'working', ago: 12 },
    { title: 'Generate an API client from the OpenAPI spec', project: 'atlas-web', provider: 'codex', host: 'laptop', pill: 'working', ago: 4 },
    { title: 'Add dark mode to the settings page', project: 'storefront', pill: 'working', label: 'Goal', ago: 41 },
    { title: 'Review pull request #482', project: 'infra', pill: 'waiting', ago: 2 },
  ],
  snoozed: [
    { title: 'Revisit caching strategy', project: 'ledger-api', ago: 5 * 60, snoozeFor: 3 * 60 },
    { title: 'Try the new bundler', project: 'atlas-web', provider: 'codex', ago: DAY / MIN, snoozeFor: 26 * 60 },
  ],
  settled: [
    { title: 'Add rate limiting to the public API', project: 'ledger-api', ago: 35 },
    { title: 'Rename the design tokens', project: 'atlas-web', provider: 'codex', ago: 2 * 60 },
    { title: 'Fix image upload on Safari', project: 'storefront', ago: 5 * 60 },
    { title: 'Set up preview deployments', project: 'infra', provider: 'codex', ago: 9 * 60 },
    { title: 'Write a migration for order notes', project: 'ledger-api', ago: 20 * 60 },
    { title: 'Audit accessibility on checkout', project: 'storefront', provider: 'codex', ago: 26 * 60 },
    { title: 'Replace the date picker', project: 'atlas-web', ago: 2 * 24 * 60 },
    { title: 'Tune the Postgres connection pool', project: 'ledger-api', provider: 'codex', ago: 2 * 24 * 60 + 300 },
    { title: 'Clean up feature flags', project: 'storefront', ago: 3 * 24 * 60 },
    { title: 'Draft the Q4 roadmap notes', project: '', ago: 4 * 24 * 60 },
    { title: 'Move secrets to the vault', project: 'infra', provider: 'codex', ago: 5 * 24 * 60 },
    { title: 'Add search to the docs site', project: 'atlas-web', ago: 6 * 24 * 60 },
    { title: 'Speed up the test suite', project: 'storefront', ago: 8 * 24 * 60 },
    { title: 'Prototype the mobile layout', project: 'atlas-web', provider: 'codex', ago: 11 * 24 * 60 },
  ],
};

// Scripted changes, in order: thread title, the section it moves to, its new pill.
const EVENTS: { title: string; section: SectionName; pill: PillKind }[] = [
  { title: 'Refactor the auth middleware', section: 'attention', pill: 'approval' },
  { title: 'Generate an API client from the OpenAPI spec', section: 'attention', pill: 'done' },
  { title: 'Review pull request #482', section: 'attention', pill: 'input' },
  { title: 'Add dark mode to the settings page', section: 'active', pill: 'failed' },
];

function thread(section: SectionName, s: Seed, now: number): Thread {
  const at = new Date(now - s.ago * MIN).toISOString();
  const kind = s.pill;
  return {
    host: s.host ?? 'desktop',
    id: `demo-${s.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    title: s.title,
    project: s.project || 'No project',
    provider: s.provider ?? 'claude',
    branch: s.branch ?? null,
    pill: kind ? { kind, label: s.label ?? LABEL[kind], since: at } : null,
    dim: !kind || kind === 'working' || kind === 'waiting',
    age: at,
    snoozedUntil: s.snoozeFor ? new Date(now + s.snoozeFor * MIN).toISOString() : null,
    settledAt: section === 'settled' ? at : null,
  };
}

export function createDemo() {
  // When each scripted event fired, in order.
  let fired: number[] = [];
  return {
    status: (now: number) => build(fired, now),
    // Plays the next event; after the last one, starts the script over.
    advance(now = Date.now()) {
      fired = fired.length === EVENTS.length ? [] : [...fired, now];
    },
    reset() {
      fired = [];
    },
  };
}

export const demoStatus = (now: number) => build([], now);

function build(fired: number[], now: number) {
  const seeds = Object.fromEntries(Object.entries(SEEDS).map(([name, list]) => [name, [...list]])) as Record<SectionName, Seed[]>;
  fired.forEach((at, i) => {
    const e = EVENTS[i];
    for (const list of Object.values(seeds)) {
      const j = list.findIndex(s => s.title === e.title);
      if (j < 0) continue;
      const [s] = list.splice(j, 1);
      seeds[e.section].unshift({ ...s, pill: e.pill, label: undefined, ago: (now - at) / MIN });
    }
  });
  const sections = Object.fromEntries(
    Object.entries(seeds).map(([name, list]) => {
      const threads = list.map(s => thread(name as SectionName, s, now));
      return [name, { count: threads.length, threads }];
    }),
  ) as Record<SectionName, { count: number; threads: Thread[] }>;
  const iso = (offset: number) => new Date(now + offset).toISOString();
  return {
    generatedAt: iso(0),
    usage: {
      claude: {
        error: null,
        plan: 'max',
        fiveHour: { pct: 38, resetsAt: iso(2 * HOUR + 14 * MIN) },
        weekly: { pct: 61, resetsAt: iso(3 * DAY + 5 * HOUR) },
        polledAt: iso(-20_000),
      },
      codex: {
        error: null,
        plan: 'pro',
        fiveHour: { pct: 17, resetsAt: iso(3 * HOUR + 40 * MIN) },
        weekly: { pct: 82, resetsAt: iso(5 * DAY + 2 * HOUR) },
        observedAt: iso(-2 * MIN),
      },
    },
    t3: {
      hosts: [
        { name: 'desktop', ok: true, error: null },
        { name: 'laptop', ok: true, error: null },
      ],
      sections,
    },
  };
}
