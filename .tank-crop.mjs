import sharp from 'sharp';
const [file, out, l, t, w, h, scale] = process.argv.slice(2);
await sharp(file)
  .extract({ left: +l, top: +t, width: +w, height: +h })
  .resize({ width: Math.round(+w * (+scale || 4)), kernel: 'nearest' })
  .flatten({ background: '#202030' })
  .png()
  .toFile(out);
console.log('wrote', out);
