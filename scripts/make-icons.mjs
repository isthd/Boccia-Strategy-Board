// アプリアイコンを SVG で描き、Playwright(Chromium) で PNG に書き出すスクリプト
// 実行: node scripts/make-icons.mjs
import { writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

// rounded: true ならブラウザタブ用に角丸。ホーム画面用(PNG)は OS が角を切るので四角のまま。
// 球はマスカブルアイコンの安全領域(中心から半径40%)に収まる配置にしている。
function iconSvg({ rounded }) {
  const ball = (id, cx, cy, r, c1, c2, c3, seamRot) => `
    <ellipse cx="${cx + r * 0.12}" cy="${cy + r * 0.9}" rx="${r * 0.95}" ry="${r * 0.28}" fill="#020617" opacity="0.55" filter="url(#blur)"/>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#${id})"/>
    <g clip-path="url(#clip-${id})" transform="rotate(${seamRot} ${cx} ${cy})">
      <path d="M ${cx - r} ${cy - r * 0.15} C ${cx - r * 0.4} ${cy + r * 0.35}, ${cx + r * 0.4} ${cy + r * 0.35}, ${cx + r} ${cy - r * 0.15}"
        fill="none" stroke="#ffffff" stroke-opacity="0.28" stroke-width="${r * 0.045}" stroke-dasharray="${r * 0.09} ${r * 0.07}"/>
    </g>
    <ellipse cx="${cx - r * 0.34}" cy="${cy - r * 0.4}" rx="${r * 0.32}" ry="${r * 0.2}" fill="#ffffff" opacity="0.55"
      transform="rotate(-30 ${cx - r * 0.34} ${cy - r * 0.4})" filter="url(#soft)"/>
    <defs>
      <radialGradient id="${id}" cx="0.36" cy="0.3" r="0.8">
        <stop offset="0" stop-color="${c1}"/>
        <stop offset="0.55" stop-color="${c2}"/>
        <stop offset="1" stop-color="${c3}"/>
      </radialGradient>
      <clipPath id="clip-${id}"><circle cx="${cx}" cy="${cy}" r="${r}"/></clipPath>
    </defs>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#1e3a5f"/>
      <stop offset="0.55" stop-color="#0f172a"/>
      <stop offset="1" stop-color="#070b16"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.42" r="0.5">
      <stop offset="0" stop-color="#38bdf8" stop-opacity="0.35"/>
      <stop offset="1" stop-color="#38bdf8" stop-opacity="0"/>
    </radialGradient>
    <filter id="blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="9"/></filter>
    <filter id="soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="5"/></filter>
    <clipPath id="frame"><rect width="512" height="512" rx="${rounded ? 112 : 0}"/></clipPath>
  </defs>
  <g clip-path="url(#frame)">
    <rect width="512" height="512" fill="url(#bg)"/>
    <rect width="512" height="512" fill="url(#glow)"/>
    <!-- コート中央のクロスと、投球の軌跡 -->
    <g stroke="#ffffff" stroke-opacity="0.16" stroke-width="6" stroke-linecap="round">
      <line x1="256" y1="96" x2="256" y2="136"/>
      <line x1="236" y1="116" x2="276" y2="116"/>
    </g>
    <path d="M 70 480 Q 72 380 112 330" fill="none" stroke="#fbbf24" stroke-opacity="0.85"
      stroke-width="7" stroke-linecap="round" stroke-dasharray="2 20"/>
    ${ball('jack', 258, 204, 52, '#ffffff', '#e2e8f0', '#8193a8', 20)}
    ${ball('red', 184, 322, 76, '#ff7a7a', '#dc2626', '#6b1010', -15)}
    ${ball('blue', 334, 332, 76, '#7cb4ff', '#2563eb', '#0f2a6b', 25)}
  </g>
</svg>`;
}

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
async function renderPng(size, file) {
  await page.setViewportSize({ width: size, height: size });
  const svg = iconSvg({ rounded: false }).replace('width="512" height="512"', `width="${size}" height="${size}"`);
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
  writeFileSync(file, await page.screenshot({ omitBackground: true }));
}
await renderPng(192, 'public/icon-192.png');
await renderPng(512, 'public/icon-512.png');
await renderPng(180, 'public/apple-touch-icon.png');
await browser.close();

writeFileSync('public/icon.svg', iconSvg({ rounded: true }).replace(/\n\s*/g, ' '));
console.log('icons generated');
