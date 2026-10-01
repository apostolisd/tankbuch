// Erzeugt PNG-Icons ohne externe Abhängigkeiten: node scripts/make-icons.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const BG = [11, 93, 75];
const FG = [255, 255, 255];

// Tropfen: Kreis (Mitte 0.5/0.6, r 0.2) + Spitze bei (0.5, 0.2)
function deckung(x, y, skala) {
  // Koordinaten relativ, skala<1 verkleinert das Motiv (maskable: Sicherheitszone)
  const u = (x - 0.5) / skala + 0.5;
  const v = (y - 0.5) / skala + 0.5;
  const cx = 0.5, cy = 0.6, r = 0.2, sy = 0.2;
  const dx = u - cx, dy = v - cy;
  if (dx * dx + dy * dy <= r * r) return true;
  if (v >= sy && v <= cy) {
    // Tangentenkegel: Breite wächst linear von Spitze bis Kreismitte-Höhe
    const breite = r * ((v - sy) / (cy - sy));
    return Math.abs(dx) <= breite;
  }
  return false;
}

const crcTab = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTab[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(typ, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const t = Buffer.from(typ, 'ascii');
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, c]);
}

function png(groesse, skala, abgerundet) {
  const SS = 3;
  const roh = Buffer.alloc((groesse * 3 + 1) * groesse);
  for (let py = 0; py < groesse; py++) {
    roh[py * (groesse * 3 + 1)] = 0;
    for (let px = 0; px < groesse; px++) {
      let fg = 0;
      for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
        if (deckung((px + (sx + 0.5) / SS) / groesse, (py + (sy + 0.5) / SS) / groesse, skala)) fg++;
      }
      const a = fg / (SS * SS);
      const o = py * (groesse * 3 + 1) + 1 + px * 3;
      for (let i = 0; i < 3; i++) roh[o + i] = Math.round(BG[i] * (1 - a) + FG[i] * a);
    }
  }
  const kopf = Buffer.alloc(13);
  kopf.writeUInt32BE(groesse, 0); kopf.writeUInt32BE(groesse, 4);
  kopf[8] = 8; kopf[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', kopf), chunk('IDAT', deflateSync(roh)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync('public', { recursive: true });
writeFileSync('public/icon-192.png', png(192, 1));
writeFileSync('public/icon-512.png', png(512, 1));
writeFileSync('public/icon-maskable-512.png', png(512, 0.75));
writeFileSync('public/apple-touch-icon.png', png(180, 1)); // iOS rundet selbst ab

writeFileSync('public/icon.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="96" fill="#0b5d4b"/>
  <path fill="#fff" d="M256 102.400 L358.400 307.200 A102.400 102.400 0 1 1 153.600 307.200 Z"/>
</svg>
`);
console.log('Icons geschrieben.');
