// Puts each 800x480 screenshot (captured at 2x) into the Car Thing frame.
// Writes docs/screenshots/framed/<name>.png, docs/screenshots/overview.png (all
// of them in one captioned grid), and docs/device/car-thing-frame.png.
// Needs rsvg-convert (librsvg). Run: bun scripts/frame-screenshots.ts
import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const DOCS = join(import.meta.dir, '../docs');
const SHOTS = join(DOCS, 'screenshots');
const OUT = join(SHOTS, 'framed');
const FRAME = readFileSync(join(DOCS, 'device/car-thing-frame.svg'), 'utf8');
const PLACEHOLDER = '<g id="screen" clip-path="url(#screenClip)"/>';

// Overview grid: one row per group, captions under each screen.
const GRID: { title: string; shots: [file: string, name: string, hint: string][] }[] = [
  {
    title: 'Views',
    shots: [
      ['01-dashboard.png', 'Dashboard', 'usage, pinned and active threads'],
      ['02-attention.png', 'Attention', 'preset 1 · waiting on you'],
      ['03-working.png', 'Working', 'preset 2 · running now'],
      ['04-snoozed.png', 'Snoozed', 'preset 3 · when they wake'],
      ['05-settled.png', 'Settled', 'preset 4 · recently done'],
    ],
  },
  {
    title: 'Alerts',
    shots: [
      ['06-alert-approval.png', 'Approval needed', 'a thread asks before acting'],
      ['07-alert-input.png', 'Input needed', 'a thread has a question'],
      ['08-alert-finished.png', 'Finished', 'a run completed'],
      ['09-alert-failed.png', 'Failed', 'a run errored or hit a limit'],
      ['10-alert-several.png', 'Stacked alerts', 'newest on top, the rest listed'],
    ],
  },
];

function render(svg: string, out: string, env?: NodeJS.ProcessEnv) {
  const r = spawnSync('rsvg-convert', ['-o', out], { input: svg, env: env ?? process.env });
  if (r.error || r.status !== 0) throw new Error(`rsvg-convert failed for ${out}: ${r.error?.message ?? r.stderr}`);
}

// Width and height from the PNG IHDR chunk.
function size(png: Buffer) {
  return { w: png.readUInt32BE(16), h: png.readUInt32BE(20) };
}

mkdirSync(OUT, { recursive: true });
render(FRAME, join(DOCS, 'device/car-thing-frame.png'));

for (const name of readdirSync(SHOTS).filter(f => f.endsWith('.png')).sort()) {
  const png = readFileSync(join(SHOTS, name));
  const { w, h } = size(png);
  if (w !== 1600 || h !== 960) continue; // settings and icon aren't device screens
  const image = `<image x="176" y="193" width="1600" height="960" href="data:image/png;base64,${png.toString('base64')}"/>`;
  render(FRAME.replace(PLACEHOLDER, `<g id="screen" clip-path="url(#screenClip)">${image}</g>`), join(OUT, name));
  console.log(`framed ${name}`);
}

// Tiles are framed screenshots scaled to TILE wide; the frame's own transparent
// margin (100 of 2394 units) spaces them out, so captions line up with the body.
const TILE = 800;
const TILE_H = Math.round((TILE * 1329) / 2394);
const INSET = Math.round((TILE * 100) / 2394);
const MARGIN = 80;
const GAP = 16;
const MONO = "'JetBrains Mono', 'JetBrainsMono Nerd Font', Menlo, monospace";
const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const cols = Math.max(...GRID.map(g => g.shots.length));
const width = MARGIN * 2 + cols * TILE + (cols - 1) * GAP;
const parts: string[] = [];
let y = MARGIN;
parts.push(
  `<text x="${MARGIN + INSET}" y="${y + 60}" font-family="Outfit" font-weight="600" font-size="68" fill="#efefef">T3 Things</text>`,
  `<text x="${MARGIN + INSET}" y="${y + 112}" font-family="Inter" font-size="30" fill="#8a9099">Claude and Codex usage and T3 Code threads on a Spotify Car Thing. Demo data.</text>`,
);
y += 170;
for (const group of GRID) {
  parts.push(`<text x="${MARGIN + INSET}" y="${y + 30}" font-family="${MONO}" font-size="24" letter-spacing="5" fill="#5d636b">${group.title.toUpperCase()}</text>`);
  y += 30;
  group.shots.forEach(([file, name, hint], i) => {
    const x = MARGIN + i * (TILE + GAP);
    const png = readFileSync(join(OUT, file)).toString('base64');
    parts.push(
      `<image x="${x}" y="${y}" width="${TILE}" height="${TILE_H}" href="data:image/png;base64,${png}"/>`,
      `<text x="${x + INSET}" y="${y + TILE_H + 8}" font-family="Outfit" font-weight="500" font-size="34" fill="#efefef">${esc(name)}</text>`,
      `<text x="${x + INSET}" y="${y + TILE_H + 48}" font-family="${MONO}" font-size="22" fill="#8a9099">${esc(hint)}</text>`,
    );
  });
  y += TILE_H + 110;
}
const height = y + MARGIN - 50;
const grid = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#0a0c0e"/>
  ${parts.join('\n  ')}
</svg>`;

// Point fontconfig at the app's bundled Outfit and Inter for the captions.
const fontsConf = join(tmpdir(), 't3things-fonts.conf');
writeFileSync(
  fontsConf,
  `<?xml version="1.0"?><!DOCTYPE fontconfig SYSTEM "fonts.dtd"><fontconfig><include ignore_missing="yes">/etc/fonts/fonts.conf</include><dir>${join(import.meta.dir, '../src/fonts')}</dir></fontconfig>`,
);
render(grid, join(SHOTS, 'overview.png'), { ...process.env, FONTCONFIG_FILE: fontsConf });
console.log(`wrote overview.png (${width}x${height})`);
