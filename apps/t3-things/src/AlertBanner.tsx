// Full-screen alert shown over the dashboard. The border flashes a few times
// when a new alert lands, then holds until any button or a tap dismisses it.
import type { CSSProperties } from 'react';
import type { Alert, AlertKind } from './alerts';
import claudeLogo from './icons/claude.svg';
import codexLogo from './icons/codex.svg';

const MORE_ROWS = 3;

// Same palette as the thread pills.
const STYLE: Record<AlertKind, { label: string; text: string; color: string }> = {
  approval: { label: 'Approval needed', text: 'text-experimental', color: 'var(--color-experimental)' },
  input: { label: 'Input needed', text: 'text-[#a5b4fc]', color: '#a5b4fc' },
  done: { label: 'Finished', text: 'text-ok', color: 'var(--color-ok)' },
  failed: { label: 'Failed', text: 'text-warn', color: 'var(--color-warn)' },
};

export function AlertBanner({ alerts, onDismiss }: { alerts: Alert[]; onDismiss: () => void }) {
  const [top, ...rest] = alerts;
  const style = STYLE[top.kind];
  const shown = rest.slice(0, MORE_ROWS);
  const hidden = rest.length - shown.length;
  const provider = top.thread.provider === 'claude' ? claudeLogo : top.thread.provider === 'codex' ? codexLogo : null;

  return (
    <div
      // Keyed on the newest alert so the flash replays when another one lands.
      key={`${top.key}:${top.at}`}
      className="alert-flash absolute inset-0 z-10 flex flex-col gap-4 bg-bg p-8"
      style={{ '--alert-color': style.color } as CSSProperties}
      onPointerDown={onDismiss}>
      <div className="flex items-center gap-3">
        <span className="alert-dot inline-block h-4 w-4 rounded-full" />
        <span className={`font-display text-screen-title font-semibold tracking-display ${style.text}`}>{style.label}</span>
      </div>

      <div className="flex flex-col gap-1">
        <div className="font-mono text-body uppercase tracking-[0.15em] text-soft">{top.thread.project || 'No project'}</div>
        <div className="line-clamp-2 font-display text-[2.5rem] font-medium leading-tight tracking-display text-off-white">{top.thread.title}</div>
        <div className="flex items-center gap-2 font-mono text-body text-dim">
          {provider && <img src={provider} alt="" className="h-4 w-4" />}
          <span>{top.thread.host}</span>
          {top.thread.branch && <span className="truncate">{top.thread.branch}</span>}
        </div>
      </div>

      {shown.length > 0 && (
        <div className="flex flex-col border-t border-rule">
          {shown.map(a => (
            <div key={a.key} className="flex items-center gap-3 border-b border-rule py-1.5">
              <span className={`w-36 shrink-0 font-mono text-hint ${STYLE[a.kind].text}`}>{STYLE[a.kind].label}</span>
              <span className="truncate text-row text-near">{a.thread.title}</span>
              <span className="ml-auto shrink-0 font-mono text-eyebrow text-dim">{a.thread.project}</span>
            </div>
          ))}
          {hidden > 0 && <div className="py-1.5 font-mono text-hint text-dim">and {hidden} more</div>}
        </div>
      )}

      <div className="mt-auto font-mono text-hint text-dim">any button dismisses · 1 opens Attention</div>
    </div>
  );
}
