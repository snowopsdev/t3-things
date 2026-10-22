// Playable demo: the app runs in ?demo mode inside an iframe laid over the
// device frame. The frame's buttons send the same events the Car Thing does
// (keys 1-4, m, Escape, Enter, horizontal wheel), and a tour drives them.
import frameSvg from '../docs/device/car-thing-frame.svg?raw';
import './style.css';

type AlertKind = 'approval' | 'input' | 'done' | 'failed';
type AppHooks = {
  testAlert(kind: AlertKind): void;
  demo: { advance(): void; reset(): void } | null;
};

// Frame geometry, in the SVG's units (see the comment in the SVG).
const FRAME = { w: 2394, h: 1329 };
const SCREEN = { x: 176, y: 193, w: 1600, h: 960 };
const PRESETS = [
  { id: 'preset-1', key: '1', x: 300, w: 170 },
  { id: 'preset-2', key: '2', x: 712, w: 170 },
  { id: 'preset-3', key: '3', x: 1124, w: 170 },
  { id: 'preset-4', key: '4', x: 1536, w: 170 },
  { id: 'mode', key: 'm', x: 1947, w: 110 },
];
const DIAL = { cx: 1988, cy: 511, r: 306 };
const SVG_NS = 'http://www.w3.org/2000/svg';
// The production build renames the app page so the demo can be index.html.
const APP_URL = `${import.meta.env.DEV ? '/index.html' : './app.html'}?demo`;

type Step = { say?: string; key?: string; wheel?: number; advance?: boolean; reset?: boolean; wait: number };

const TOUR: Step[] = [
  { reset: true, say: 'Claude and Codex usage up top. Pinned and active T3 threads below.', wait: 4500 },
  { key: '1', say: "Preset 1 opens Attention: threads waiting on you, and finished runs you haven't opened.", wait: 4200 },
  { key: '2', say: "Preset 2 shows what's working right now, and for how long.", wait: 3800 },
  { key: '3', say: 'Preset 3 lists snoozed threads and when they wake up.', wait: 3500 },
  { key: '4', say: 'Preset 4 shows recently settled threads. Turn the dial to scroll.', wait: 1400 },
  { wheel: 220, wait: 1000 },
  { wheel: 220, wait: 1800 },
  { key: 'Escape', say: 'Back returns to the dashboard.', wait: 2600 },
  { advance: true, say: 'A thread stops to ask for approval, and the whole screen flashes so you notice.', wait: 5500 },
  { key: '1', say: 'Any button clears the alert. Preset 1 also jumps straight to Attention.', wait: 3800 },
  { key: 'Escape', wait: 1200 },
  { advance: true, say: 'Finished runs get an alert too.', wait: 4000 },
  { advance: true, wait: 700 },
  { advance: true, say: 'Alerts that land together stack up, newest on top.', wait: 5500 },
  { key: 'Escape', say: 'Tap the screen or press any button to clear them. Then the tour starts over.', wait: 3500 },
];

const device = document.getElementById('device')!;
const iframe = document.getElementById('screen') as HTMLIFrameElement;
const caption = document.getElementById('caption')!;
const tourButton = document.getElementById('tour') as HTMLButtonElement;

device.insertAdjacentHTML('afterbegin', frameSvg.replace(/^[\s\S]*?(?=<svg)/, ''));
const svg = device.querySelector('svg')!;
svg.removeAttribute('width');
svg.removeAttribute('height');

// Bigger, invisible click targets over the thin top-edge buttons.
for (const p of PRESETS) {
  const hit = document.createElementNS(SVG_NS, 'rect');
  Object.entries({ x: p.x - 30, y: 20, width: p.w + 60, height: 140, fill: 'transparent' }).forEach(([k, v]) => hit.setAttribute(k, String(v)));
  hit.classList.add('hit');
  const button = svg.querySelector(`#${p.id}`)!;
  hit.addEventListener('pointerenter', () => button.classList.add('hover'));
  hit.addEventListener('pointerleave', () => button.classList.remove('hover'));
  hit.addEventListener('click', () => {
    takeOver();
    press(p.key);
  });
  svg.appendChild(hit);
}

// Grip ticks around the dial so turning it is visible.
const dial = svg.querySelector<SVGGElement>('#dial')!;
const ticks = document.createElementNS(SVG_NS, 'g');
ticks.classList.add('ticks');
for (let i = 0; i < 72; i++) {
  const a = (i / 72) * Math.PI * 2;
  const line = document.createElementNS(SVG_NS, 'line');
  const [r1, r2] = [DIAL.r - 12, DIAL.r - 2];
  Object.entries({
    x1: DIAL.cx + r1 * Math.cos(a),
    y1: DIAL.cy + r1 * Math.sin(a),
    x2: DIAL.cx + r2 * Math.cos(a),
    y2: DIAL.cy + r2 * Math.sin(a),
  }).forEach(([k, v]) => line.setAttribute(k, v.toFixed(1)));
  ticks.appendChild(line);
}
dial.appendChild(ticks);
let dialAngle = 0;

const back = svg.querySelector<SVGGElement>('#back')!;
title(dial, 'Dial: scroll to turn, click to press');
title(back, 'Back');
dial.addEventListener('click', () => {
  takeOver();
  press('Enter');
});
back.addEventListener('click', () => {
  takeOver();
  press('Escape');
});
dial.addEventListener(
  'wheel',
  e => {
    e.preventDefault();
    takeOver();
    turn(e.deltaX || e.deltaY);
  },
  { passive: false },
);

// Keep the 800x480 page scaled to the frame's screen window.
iframe.style.left = `${(SCREEN.x / FRAME.w) * 100}%`;
iframe.style.top = `${(SCREEN.y / FRAME.h) * 100}%`;
new ResizeObserver(([entry]) => {
  const scale = (entry.contentRect.width * (SCREEN.w / FRAME.w)) / 800;
  iframe.style.transform = `scale(${scale})`;
}).observe(device);

// Hardware keys typed on the page go to the app, as on the device.
window.addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey || e.altKey || !['1', '2', '3', '4', 'm', 'Escape', 'Enter'].includes(e.key)) return;
  if (e.target instanceof HTMLButtonElement && e.key === 'Enter') return;
  e.preventDefault();
  takeOver();
  press(e.key);
});

function app(): AppHooks | undefined {
  return (iframe.contentWindow as unknown as { t3things?: AppHooks } | null)?.t3things;
}

function press(key: string) {
  const win = iframe.contentWindow as (Window & typeof globalThis) | null;
  win?.dispatchEvent(new win.KeyboardEvent('keydown', { key }));
  const el = key === 'Escape' ? back : key === 'Enter' ? dial : svg.querySelector(`#${PRESETS.find(p => p.key === key)?.id}`);
  if (!el) return;
  el.classList.add('down');
  setTimeout(() => el.classList.remove('down'), 180);
}

function turn(delta: number) {
  const win = iframe.contentWindow as (Window & typeof globalThis) | null;
  win?.dispatchEvent(new win.WheelEvent('wheel', { deltaX: delta }));
  dialAngle += delta / 8;
  ticks.style.transform = `rotate(${dialAngle}deg)`;
}

function title(el: Element, text: string) {
  const t = document.createElementNS(SVG_NS, 'title');
  t.textContent = text;
  el.prepend(t);
}

// Tour: runs until someone touches a control, then waits for Play.
let run = 0;

async function play() {
  const mine = ++run;
  tourButton.textContent = 'Pause tour';
  while (mine === run) {
    for (const step of TOUR) {
      if (mine !== run) return;
      if (step.say) caption.textContent = step.say;
      if (step.reset) app()?.demo?.reset();
      if (step.advance) app()?.demo?.advance();
      if (step.key) press(step.key);
      if (step.wheel) turn(step.wheel);
      await new Promise(r => setTimeout(r, step.wait));
    }
  }
}

function pause(say?: string) {
  if (!playing()) return;
  run++;
  tourButton.textContent = 'Play tour';
  caption.textContent = say ?? "Tour paused. You're driving now; press Play tour to watch again.";
}

const playing = () => tourButton.textContent === 'Pause tour';
const takeOver = () => pause();

tourButton.addEventListener('click', () => (playing() ? pause('Tour paused.') : play()));
document.getElementById('next')!.addEventListener('click', () => {
  pause();
  app()?.demo?.advance();
  caption.textContent = 'Next event: a thread changes state, as if it happened at your desk.';
});
document.getElementById('reset')!.addEventListener('click', () => {
  pause();
  app()?.demo?.reset();
  caption.textContent = 'Back to the start.';
});
for (const b of document.querySelectorAll<HTMLButtonElement>('[data-alert]')) {
  b.addEventListener('click', () => {
    pause();
    app()?.testAlert(b.dataset.alert as AlertKind);
    caption.textContent = `A test ${b.textContent!.toLowerCase()} alert. Tap the screen or press a button to clear it.`;
  });
}

iframe.addEventListener('load', () => {
  const win = iframe.contentWindow!;
  // Real taps, keys, and scrolls inside the screen pause the tour; the tour's
  // own synthetic events are untrusted, so they don't.
  for (const type of ['pointerdown', 'keydown', 'wheel']) win.addEventListener(type, e => e.isTrusted && takeOver(), true);
  const start = setInterval(() => {
    if (!app()?.demo) return;
    clearInterval(start);
    play();
  }, 100);
});
iframe.src = APP_URL;
