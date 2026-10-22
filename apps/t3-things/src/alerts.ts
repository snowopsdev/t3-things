// Turns successive status polls into alerts: a thread that starts waiting on
// you (approval or input), or a run that finishes or fails.
import type { PillKind, SectionName, Sections, Thread } from './Threads';

export type AlertKind = 'approval' | 'input' | 'done' | 'failed';
export type Alert = { key: string; kind: AlertKind; thread: Thread; at: number };
export type AlertPrefs = { attention: boolean; finished: boolean };

// Last pill seen per thread. Entries are never dropped, so a thread that falls
// out of the settled preview or sits on a host that went down is compared
// against what it was, not treated as new.
export type Seen = Map<string, PillKind | null>;

const SECTIONS: SectionName[] = ['attention', 'pinned', 'active', 'working', 'snoozed', 'settled'];

export const threadKey = (t: Thread) => `${t.host}:${t.id}`;

function alertKind(pill: PillKind | null): AlertKind | null {
  if (pill === 'approval' || pill === 'input' || pill === 'done') return pill;
  if (pill === 'failed' || pill === 'limited') return 'failed';
  return null;
}

function wanted(kind: AlertKind, prefs: AlertPrefs): boolean {
  return kind === 'approval' || kind === 'input' ? prefs.attention : prefs.finished;
}

// Returns alerts for threads whose pill changed into an alerting state since
// the last poll. The first poll only records a baseline.
export function diffAlerts(seen: Seen, sections: Sections, prefs: AlertPrefs, now: number): Alert[] {
  const baseline = seen.size === 0;
  const alerts: Alert[] = [];
  for (const name of SECTIONS) {
    for (const t of sections[name].threads) {
      const key = threadKey(t);
      const pill = t.pill?.kind ?? null;
      const known = seen.has(key);
      const before = seen.get(key) ?? null;
      seen.set(key, pill);
      if (baseline || name === 'snoozed' || pill === before) continue;
      const kind = alertKind(pill);
      if (!kind || alertKind(before) === kind || !wanted(kind, prefs)) continue;
      // An unseen thread is usually one scrolling into the settled preview, so
      // only something blocked on you is worth flagging for it.
      if (!known && kind !== 'approval' && kind !== 'input') continue;
      alerts.push({ key, kind, thread: t, at: now });
    }
  }
  return alerts;
}

// Newer alerts replace older ones for the same thread; alerts whose thread has
// moved on (approved at the desk, opened in T3) drop out. Test alerts on a
// thread no poll has reported stay until dismissed.
export function mergeAlerts(current: Alert[], incoming: Alert[], seen: Seen): Alert[] {
  const fresh = new Set(incoming.map(a => a.key));
  const kept = current.filter(a => !fresh.has(a.key) && (!seen.has(a.key) || alertKind(seen.get(a.key) ?? null) === a.kind));
  return [...incoming, ...kept];
}
