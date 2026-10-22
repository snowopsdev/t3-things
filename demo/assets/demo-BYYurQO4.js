import"./modulepreload-polyfill-P2Xu9kJm.js";var e=`<?xml version="1.0" encoding="UTF-8"?>
<!--
  Car Thing device frame, drawn from scratch for these docs (not a Spotify asset).
  The screen is a transparent window at x=176 y=193, 1600x960 (the 800x480
  display at 2x), corner radius 22. The dial overlaps the screen's top-right
  corner like it does on the hardware, so put the screenshot under this frame.
  scripts/frame-screenshots.ts fills the #screen placeholder and renders PNGs;
  the playable demo (demo.html) wires up the controls by their ids.
-->
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="2394" height="1329" viewBox="0 0 2394 1329">
  <defs>
    <linearGradient id="shell" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#37383c"/>
      <stop offset="0.5" stop-color="#232427"/>
      <stop offset="1" stop-color="#161719"/>
    </linearGradient>
    <linearGradient id="glass" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#121214"/>
      <stop offset="1" stop-color="#0a0a0b"/>
    </linearGradient>
    <linearGradient id="glare" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity="0.06"/>
      <stop offset="0.5" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
    <radialGradient id="dialFill" cx="0.42" cy="0.36" r="0.75">
      <stop offset="0" stop-color="#36373b"/>
      <stop offset="0.7" stop-color="#232427"/>
      <stop offset="1" stop-color="#18191b"/>
    </radialGradient>
    <linearGradient id="dialEdge" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#4a4b50"/>
      <stop offset="1" stop-color="#101112"/>
    </linearGradient>
    <radialGradient id="backFill" cx="0.5" cy="0.62" r="0.7">
      <stop offset="0" stop-color="#2c2d30"/>
      <stop offset="1" stop-color="#18191b"/>
    </radialGradient>
    <linearGradient id="key" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#3b3c40"/>
      <stop offset="1" stop-color="#1b1c1e"/>
    </linearGradient>
    <filter id="shadow" x="-10%" y="-10%" width="120%" height="135%">
      <feDropShadow dx="0" dy="28" stdDeviation="34" flood-color="#000" flood-opacity="0.45"/>
    </filter>
    <filter id="dialShadow" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="18" stdDeviation="20" flood-color="#000" flood-opacity="0.6"/>
    </filter>
    <mask id="window">
      <rect width="2394" height="1329" fill="#fff"/>
      <rect x="176" y="193" width="1600" height="960" rx="22" fill="#000"/>
    </mask>
    <clipPath id="screenClip">
      <rect x="176" y="193" width="1600" height="960" rx="22"/>
    </clipPath>
  </defs>

  <!-- Preset buttons 1-4 and the settings button on the top edge -->
  <g fill="url(#key)">
    <rect id="preset-1" x="300" y="84" width="170" height="30" rx="12"/>
    <rect id="preset-2" x="712" y="84" width="170" height="30" rx="12"/>
    <rect id="preset-3" x="1124" y="84" width="170" height="30" rx="12"/>
    <rect id="preset-4" x="1536" y="84" width="170" height="30" rx="12"/>
    <rect id="mode" x="1947" y="90" width="110" height="24" rx="10"/>
  </g>

  <!-- Shell and glass face, with the screen cut out -->
  <g mask="url(#window)">
    <rect x="100" y="100" width="2113" height="1129" rx="64" fill="url(#shell)" filter="url(#shadow)"/>
    <rect x="110" y="110" width="2093" height="1109" rx="55" fill="url(#glass)"/>
    <rect x="110.5" y="110.5" width="2092" height="1108" rx="55" fill="none" stroke="#000" stroke-opacity="0.6"/>
  </g>
  <rect x="100.5" y="100.5" width="2112" height="1128" rx="64" fill="none" stroke="#4b4c51" stroke-opacity="0.7"/>

  <!-- Screenshot goes here -->
  <g id="screen" clip-path="url(#screenClip)"/>

  <!-- Light glare across the glass -->
  <rect x="110" y="110" width="2093" height="1109" rx="55" fill="url(#glare)" pointer-events="none"/>

  <!-- Back button -->
  <g id="back">
    <circle cx="1984" cy="1016" r="100" fill="url(#backFill)"/>
    <circle cx="1984" cy="1016" r="99" fill="none" stroke="#000" stroke-opacity="0.7" stroke-width="2"/>
    <circle cx="1984" cy="1018" r="100" fill="none" stroke="#fff" stroke-opacity="0.05" stroke-width="2"/>
  </g>

  <!-- Dial -->
  <g id="dial">
    <g filter="url(#dialShadow)">
      <circle cx="1988" cy="511" r="306" fill="url(#dialEdge)"/>
      <circle cx="1988" cy="511" r="292" fill="url(#dialFill)"/>
    </g>
    <circle cx="1988" cy="511" r="291" fill="none" stroke="#fff" stroke-opacity="0.04" stroke-width="2"/>
  </g>
</svg>
`,t={w:2394,h:1329},n={x:176,y:193,w:1600,h:960},r=[{id:`preset-1`,key:`1`,x:300,w:170},{id:`preset-2`,key:`2`,x:712,w:170},{id:`preset-3`,key:`3`,x:1124,w:170},{id:`preset-4`,key:`4`,x:1536,w:170},{id:`mode`,key:`m`,x:1947,w:110}],i={cx:1988,cy:511,r:306},a=`http://www.w3.org/2000/svg`,o=`./app.html?demo`,s=[{reset:!0,say:`Claude and Codex usage up top. Pinned and active T3 threads below.`,wait:4500},{key:`1`,say:`Preset 1 opens Attention: threads waiting on you, and finished runs you haven't opened.`,wait:4200},{key:`2`,say:`Preset 2 shows what's working right now, and for how long.`,wait:3800},{key:`3`,say:`Preset 3 lists snoozed threads and when they wake up.`,wait:3500},{key:`4`,say:`Preset 4 shows recently settled threads. Turn the dial to scroll.`,wait:1400},{wheel:220,wait:1e3},{wheel:220,wait:1800},{key:`Escape`,say:`Back returns to the dashboard.`,wait:2600},{advance:!0,say:`A thread stops to ask for approval, and the whole screen flashes so you notice.`,wait:5500},{key:`1`,say:`Any button clears the alert. Preset 1 also jumps straight to Attention.`,wait:3800},{key:`Escape`,wait:1200},{advance:!0,say:`Finished runs get an alert too.`,wait:4e3},{advance:!0,wait:700},{advance:!0,say:`Alerts that land together stack up, newest on top.`,wait:5500},{key:`Escape`,say:`Tap the screen or press any button to clear them. Then the tour starts over.`,wait:3500}],c=document.getElementById(`device`),l=document.getElementById(`screen`),u=document.getElementById(`caption`),d=document.getElementById(`tour`);c.insertAdjacentHTML(`afterbegin`,e.replace(/^[\s\S]*?(?=<svg)/,``));var f=c.querySelector(`svg`);f.removeAttribute(`width`),f.removeAttribute(`height`);for(let e of r){let t=document.createElementNS(a,`rect`);Object.entries({x:e.x-30,y:20,width:e.w+60,height:140,fill:`transparent`}).forEach(([e,n])=>t.setAttribute(e,String(n))),t.classList.add(`hit`);let n=f.querySelector(`#${e.id}`);t.addEventListener(`pointerenter`,()=>n.classList.add(`hover`)),t.addEventListener(`pointerleave`,()=>n.classList.remove(`hover`)),t.addEventListener(`click`,()=>{T(),v(e.key)}),f.appendChild(t)}var p=f.querySelector(`#dial`),m=document.createElementNS(a,`g`);m.classList.add(`ticks`);for(let e=0;e<72;e++){let t=e/72*Math.PI*2,n=document.createElementNS(a,`line`),[r,o]=[i.r-12,i.r-2];Object.entries({x1:i.cx+r*Math.cos(t),y1:i.cy+r*Math.sin(t),x2:i.cx+o*Math.cos(t),y2:i.cy+o*Math.sin(t)}).forEach(([e,t])=>n.setAttribute(e,t.toFixed(1))),m.appendChild(n)}p.appendChild(m);var h=0,g=f.querySelector(`#back`);b(p,`Dial: scroll to turn, click to press`),b(g,`Back`),p.addEventListener(`click`,()=>{T(),v(`Enter`)}),g.addEventListener(`click`,()=>{T(),v(`Escape`)}),p.addEventListener(`wheel`,e=>{e.preventDefault(),T(),y(e.deltaX||e.deltaY)},{passive:!1}),l.style.left=`${n.x/t.w*100}%`,l.style.top=`${n.y/t.h*100}%`,new ResizeObserver(([e])=>{let r=e.contentRect.width*(n.w/t.w)/800;l.style.transform=`scale(${r})`}).observe(c),window.addEventListener(`keydown`,e=>{e.metaKey||e.ctrlKey||e.altKey||![`1`,`2`,`3`,`4`,`m`,`Escape`,`Enter`].includes(e.key)||e.target instanceof HTMLButtonElement&&e.key===`Enter`||(e.preventDefault(),T(),v(e.key))});function _(){return l.contentWindow?.t3things}function v(e){let t=l.contentWindow;t?.dispatchEvent(new t.KeyboardEvent(`keydown`,{key:e}));let n=e===`Escape`?g:e===`Enter`?p:f.querySelector(`#${r.find(t=>t.key===e)?.id}`);n&&(n.classList.add(`down`),setTimeout(()=>n.classList.remove(`down`),180))}function y(e){let t=l.contentWindow;t?.dispatchEvent(new t.WheelEvent(`wheel`,{deltaX:e})),h+=e/8,m.style.transform=`rotate(${h}deg)`}function b(e,t){let n=document.createElementNS(a,`title`);n.textContent=t,e.prepend(n)}var x=0;async function S(){let e=++x;for(d.textContent=`Pause tour`;e===x;)for(let t of s){if(e!==x)return;t.say&&(u.textContent=t.say),t.reset&&_()?.demo?.reset(),t.advance&&_()?.demo?.advance(),t.key&&v(t.key),t.wheel&&y(t.wheel),await new Promise(e=>setTimeout(e,t.wait))}}function C(e){w()&&(x++,d.textContent=`Play tour`,u.textContent=e??`Tour paused. You're driving now; press Play tour to watch again.`)}var w=()=>d.textContent===`Pause tour`,T=()=>C();d.addEventListener(`click`,()=>w()?C(`Tour paused.`):S()),document.getElementById(`next`).addEventListener(`click`,()=>{C(),_()?.demo?.advance(),u.textContent=`Next event: a thread changes state, as if it happened at your desk.`}),document.getElementById(`reset`).addEventListener(`click`,()=>{C(),_()?.demo?.reset(),u.textContent=`Back to the start.`});for(let e of document.querySelectorAll(`[data-alert]`))e.addEventListener(`click`,()=>{C(),_()?.testAlert(e.dataset.alert),u.textContent=`A test ${e.textContent.toLowerCase()} alert. Tap the screen or press a button to clear it.`});l.addEventListener(`load`,()=>{let e=l.contentWindow;for(let t of[`pointerdown`,`keydown`,`wheel`])e.addEventListener(t,e=>e.isTrusted&&T(),!0);let t=setInterval(()=>{_()?.demo&&(clearInterval(t),S())},100)}),l.src=o;