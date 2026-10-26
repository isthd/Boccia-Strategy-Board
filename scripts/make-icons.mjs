// アプリアイコン(PNG)を外部ライブラリなしで生成する簡易スクリプト
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};

function png(size) {
  const circles = [
    { cx: 0.5, cy: 0.42, r: 0.13, c: [255, 255, 255] },
    { cx: 0.3, cy: 0.66, r: 0.12, c: [214, 40, 40] },
    { cx: 0.7, cy: 0.66, r: 0.12, c: [29, 78, 216] },
  ];
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size, v = (y + 0.5) / size;
      let col = [15, 23, 42];
      // コート風の枠
      if (u > 0.14 && u < 0.86 && v > 0.12 && v < 0.88) col = [120, 150, 175];
      if (Math.abs(v - 0.78) < 0.012 && u > 0.14 && u < 0.86) col = [255, 255, 255];
      for (const c of circles) {
        const d = Math.hypot(u - c.cx, v - c.cy);
        if (d < c.r) col = c.c;
        else if (d < c.r + 0.012) col = [20, 20, 20];
      }
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = col[0]; raw[o + 1] = col[1]; raw[o + 2] = col[2]; raw[o + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}
writeFileSync('public/icon-192.png', png(192));
writeFileSync('public/icon-512.png', png(512));
writeFileSync('public/apple-touch-icon.png', png(180));
writeFileSync('public/icon.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="18" fill="#0f172a"/><rect x="14" y="12" width="72" height="76" fill="#7896af"/><rect x="14" y="77" width="72" height="2" fill="#fff"/><circle cx="50" cy="42" r="13" fill="#fff" stroke="#141414" stroke-width="1.5"/><circle cx="30" cy="66" r="12" fill="#d62828" stroke="#141414" stroke-width="1.5"/><circle cx="70" cy="66" r="12" fill="#1d4ed8" stroke="#141414" stroke-width="1.5"/></svg>`);
console.log('icons generated');
