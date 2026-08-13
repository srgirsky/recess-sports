import sharp from 'sharp';

const file = process.argv[2];
const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H, channels: C } = info;
const A = (x, y) => data[(y * W + x) * C + 3];
const px = (x, y) => { const i = (y * W + x) * C; return [data[i], data[i+1], data[i+2], data[i+3]]; };

// bounding box of opaque
let top = H, bot = -1, left = W, right = -1;
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (A(x,y) > 24) {
  if (y < top) top = y; if (y > bot) bot = y; if (x < left) left = x; if (x > right) right = x;
}
console.log(`${file}\n  size ${W}x${H} bbox x[${left},${right}] y[${top},${bot}] figure h=${bot-top+1} w=${right-left+1}`);

// per-row run analysis
function runs(y) {
  const out = []; let s = -1;
  for (let x = 0; x < W; x++) {
    const on = A(x,y) > 24;
    if (on && s < 0) s = x;
    if (!on && s >= 0) { out.push([s, x-1]); s = -1; }
  }
  if (s >= 0) out.push([s, W-1]);
  return out;
}
const figH = bot - top + 1;
console.log('  row scan (pct of figure height from top): runs = [start,end] widths');
for (let p = 0; p <= 100; p += 4) {
  const y = Math.min(bot, top + Math.round(figH * p / 100));
  const r = runs(y);
  const desc = r.map(([a,b]) => `${a}-${b}(${b-a+1})`).join(' | ');
  const gaps = r.length > 1 ? r.slice(1).map((rr,i) => rr[0]-r[i][1]-1).join(',') : '-';
  console.log(`   ${String(p).padStart(3)}%  y=${y}  runs=${r.length}  gaps=${gaps}  ${desc}`);
}
