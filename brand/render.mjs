// Renders the mark (mark.mjs) into every file the app ships: the Windows
// .ico, the 1024 PNG, the installer splash (.bmp), the browser-tab icon and
// the brand folder. Drawing happens in a headless Chromium, so it needs
// Playwright, which is not a dependency of the app:
//
//   npx -y -p playwright node brand/render.mjs      (CHROME=/path/to/chromium to pick one)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { master, small, tiny, sPath, LIGHT, DARK } from './mark.mjs';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = createRequire(import.meta.url)('playwright');
const b = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const p = await b.newPage();

/** An SVG drawn onto a canvas of the given size → PNG bytes (and RGBA if asked). */
async function raster(svg, w, h = w, rgba = false) {
  const out = await p.evaluate(async ([svg, w, h, rgba]) => {
    const img = new Image();
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
    await img.decode();
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'); g.imageSmoothingQuality = 'high';
    g.drawImage(img, 0, 0, w, h);
    return { png: c.toDataURL('image/png').split(',')[1], data: rgba ? Array.from(g.getImageData(0, 0, w, h).data) : null };
  }, [svg, w, h, rgba]);
  return { png: Buffer.from(out.png, 'base64'), data: out.data };
}

// ---- Windows icon: each size from the drawing made for it.
const ICO_SIZES = [[16, tiny(LIGHT)], [24, small(LIGHT)], [32, small(LIGHT)], [48, master(LIGHT)], [64, master(LIGHT)], [128, master(LIGHT)], [256, master(LIGHT)]];
const images = [];
for (const [s, svg] of ICO_SIZES) images.push({ s, png: (await raster(svg, s)).png });
const header = Buffer.alloc(6); header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(images.length, 4);
let offset = 6 + 16 * images.length;
const dir = images.map(({ s, png }) => {
  const e = Buffer.alloc(16);
  e.writeUInt8(s >= 256 ? 0 : s, 0); e.writeUInt8(s >= 256 ? 0 : s, 1);
  e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6); e.writeUInt32LE(png.length, 8); e.writeUInt32LE(offset, 12);
  offset += png.length; return e;
});
fs.writeFileSync(`${ROOT}/assets/icon.ico`, Buffer.concat([header, ...dir, ...images.map((i) => i.png)]));
fs.writeFileSync(`${ROOT}/assets/icon.png`, (await raster(master(LIGHT), 1024)).png);

// ---- Installer splash, 500x300, 24-bit BMP.
const sized = (svg, px) => svg.replace(/width="\d+" height="\d+"/, `width="${px}" height="${px}"`);
const markData = 'data:image/svg+xml;base64,' + Buffer.from(sized(master({ ...LIGHT, tile: '#F7F2E8' }), 64)).toString('base64');
const splashSvg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="500" height="300" viewBox="0 0 500 300">
  <defs>
    <radialGradient id="g" cx="0.2" cy="0" r="1.1"><stop offset="0" stop-color="#e8dcc4"/><stop offset="0.6" stop-color="#efe8da"/><stop offset="1" stop-color="#ebe3d4"/></radialGradient>
    <filter id="s" x="-40%" y="-40%" width="180%" height="180%"><feDropShadow dx="0" dy="3" stdDeviation="5" flood-color="#5a4426" flood-opacity="0.16"/></filter>
  </defs>
  <rect width="500" height="300" fill="url(#g)"/>
  <image href="${markData}" x="218" y="78" width="64" height="64" filter="url(#s)"/>
  <text x="250" y="190" text-anchor="middle" font-family="Liberation Serif, FreeSerif, serif" font-size="34" fill="#241B12" letter-spacing="-0.3">Signature</text>
  <text x="250" y="218" text-anchor="middle" font-family="DejaVu Sans, sans-serif" font-size="11.5" fill="#6b5a42">Starting up — this takes a few seconds. One click is enough.</text>
</svg>`;
const sp = await raster(splashSvg, 500, 300, true);
const W = 500, H = 300, stride = W * 3; // 1500, already a multiple of 4
const bmp = Buffer.alloc(54 + stride * H);
bmp.write('BM', 0); bmp.writeUInt32LE(bmp.length, 2); bmp.writeUInt32LE(54, 10);
bmp.writeUInt32LE(40, 14); bmp.writeInt32LE(W, 18); bmp.writeInt32LE(H, 22); bmp.writeUInt16LE(1, 26); bmp.writeUInt16LE(24, 28);
bmp.writeUInt32LE(stride * H, 34); bmp.writeInt32LE(2835, 38); bmp.writeInt32LE(2835, 42);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const i = ((H - 1 - y) * W + x) * 4, o = 54 + y * stride + x * 3;
  bmp[o] = sp.data[i + 2]; bmp[o + 1] = sp.data[i + 1]; bmp[o + 2] = sp.data[i];
}
fs.writeFileSync(`${ROOT}/assets/splash.bmp`, bmp);

// ---- Brand folder.
fs.writeFileSync(`${ROOT}/brand/signature-mark.svg`, master(LIGHT));
fs.writeFileSync(`${ROOT}/brand/signature-mark-dark.svg`, master(DARK));
fs.writeFileSync(`${ROOT}/brand/signature-mark-plain.svg`, master({ ...LIGHT, withTile: false }));
fs.writeFileSync(`${ROOT}/brand/signature-mark-small.svg`, small(LIGHT));
fs.writeFileSync(`${ROOT}/brand/signature-mark-tiny.svg`, tiny(LIGHT));
fs.writeFileSync(`${ROOT}/brand/signature-512.png`, (await raster(master(LIGHT), 512)).png);
fs.writeFileSync(`${ROOT}/brand/signature-512-dark.png`, (await raster(master(DARK), 512)).png);
// The browser tab: rasterised at 16-32px, so the heavier small drawing.
fs.writeFileSync(`${ROOT}/app/icon.svg`, small(LIGHT));
// The title bar draws the mark inline in the theme's colours: the S outline, at the small weight.
fs.writeFileSync(`${ROOT}/components/shell/markPath.ts`, `// Generated by brand/render.mjs from brand/mark.mjs — do not edit by hand.\nexport const MARK_S_PATH = '${sPath()}';\n`);
await b.close();
console.log('assets written');
