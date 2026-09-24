// Generates the PWA icons as real PNGs (pure Node — zlib + a hand-rolled PNG
// encoder). Run: node scripts/generate-icons.mjs
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";

const GREEN = [20, 113, 61, 255]; // #14713D (design system)
const WHITE = [255, 255, 255, 255];

const crcTable = [...Array(256)].map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, "ascii");
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function makePng(size, draw) {
  const raw = Buffer.alloc(size * (1 + size * 4));
  for (let y = 0; y < size; y += 1) {
    const rowStart = y * (1 + size * 4);
    for (let x = 0; x < size; x += 1) {
      const [r, g, b, a] = draw(x, y, size);
      const o = rowStart + 1 + x * 4;
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
      raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Dumbbell mark in the 80% safe zone (maskable) or full bleed (any). */
function dumbbell(maskable) {
  return (x, y, size) => {
    const inset = maskable ? size * 0.12 : size * 0.06;
    const span = size - 2 * inset;
    const nx = (x - inset) / span;
    const ny = (y - inset) / span;
    if (nx < 0 || nx > 1 || ny < 0 || ny > 1) return WHITE;
    const dx = Math.abs(nx - 0.5);
    const dy = Math.abs(ny - 0.5);
    const onBar = dy < 0.045 && dx < 0.3;
    const onInnerPlate = dx >= 0.28 && dx < 0.38 && dy < 0.15;
    const onOuterPlate = dx >= 0.38 && dx < 0.46 && dy < 0.09;
    return onBar || onInnerPlate || onOuterPlate ? GREEN : WHITE;
  };
}

mkdirSync("public/icons", { recursive: true });
writeFileSync("public/icons/icon-192.png", makePng(192, dumbbell(false)));
writeFileSync("public/icons/icon-512.png", makePng(512, dumbbell(false)));
writeFileSync("public/icons/icon-512-maskable.png", makePng(512, dumbbell(true)));
console.log("wrote public/icons/icon-192.png, icon-512.png, icon-512-maskable.png");
