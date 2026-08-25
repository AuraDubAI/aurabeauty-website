/**
 * tools/gen-images.mjs — generazione one-shot degli asset immagine.
 *
 * NON fa parte del build. Richiede sharp installato in locale con
 * `npm install --no-save sharp`. Non tocca build.js, il template o dist/.
 *
 * Uso: node tools/gen-images.mjs
 */

import { readFile, writeFile, stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const ASSETS = join(ROOT, 'assets');

const SOURCES = {
  hero: 'hero-bg.jpg',
  founder: 'founder.jpg',
  logo: 'logo.png',
};

/** Larghezze richieste per l'hero, con i formati da emettere. */
const HERO_WIDTHS = [
  { width: 1920, formats: ['avif', 'webp'] },
  { width: 1280, formats: ['avif', 'webp', 'jpg'] },
  { width: 768, formats: ['avif', 'webp', 'jpg'] },
];

const Q = {
  heroAvif: 52,
  heroWebp: 76,
  heroJpg: 80,
  founderAvif: 58,
  founderWebp: 80,
  logoAvif: 70,
  logoWebp: 88,
};

const warnings = [];
const rows = [];

/**
 * Dimensioni reali tenendo conto dell'orientamento EXIF: per i valori
 * di orientation da 5 a 8 sharp riporta width/height pre-rotazione.
 */
function orientedSize(meta) {
  const swap = meta.orientation !== undefined && meta.orientation >= 5;
  return swap
    ? { width: meta.height, height: meta.width }
    : { width: meta.width, height: meta.height };
}

function encoder(pipeline, format) {
  switch (format) {
    case 'avif':
      return (opts) => pipeline.avif(opts);
    case 'webp':
      return (opts) => pipeline.webp(opts);
    case 'jpg':
      return (opts) => pipeline.jpeg(opts);
    default:
      throw new Error(`formato non gestito: ${format}`);
  }
}

async function emit({ name, input, width, height, format, options, originalBytes }) {
  // .rotate() senza argomenti applica l'orientamento EXIF prima del resize.
  let pipeline = sharp(input).rotate();
  if (width && height) {
    pipeline = pipeline.resize({ width, height, fit: 'fill', withoutEnlargement: true });
  }
  const buf = await encoder(pipeline, format)(options).toBuffer();
  const out = join(ASSETS, name);
  await writeFile(out, buf);

  const meta = await sharp(buf).metadata();
  rows.push({
    name,
    width: meta.width,
    height: meta.height,
    bytes: buf.length,
    originalBytes,
  });
}

function fmtBytes(n) {
  return n >= 1024 * 1024
    ? `${(n / (1024 * 1024)).toFixed(2)} MB`
    : `${(n / 1024).toFixed(1)} KB`;
}

function pad(s, n) {
  s = String(s);
  return s + ' '.repeat(Math.max(0, n - s.length));
}

function padLeft(s, n) {
  s = String(s);
  return ' '.repeat(Math.max(0, n - s.length)) + s;
}

async function main() {
  // --- 1. lettura sorgenti e stampa dimensioni reali -----------------
  const src = {};
  console.log('Sorgenti\n');
  for (const [key, file] of Object.entries(SOURCES)) {
    const path = join(ASSETS, file);
    const buf = await readFile(path);
    const meta = await sharp(buf).metadata();
    const { width, height } = orientedSize(meta);
    const bytes = (await stat(path)).size;
    src[key] = { file, buf, width, height, bytes };
    const ratio = (width / height).toFixed(4);
    console.log(
      `  ${pad(file, 14)} ${width}x${height}  ratio ${ratio}  ` +
        `${fmtBytes(bytes)}  (${meta.format}, alpha: ${meta.hasAlpha ? 'sì' : 'no'})`
    );
  }
  console.log('');

  // --- 2. hero: altezze derivate dal rapporto d'aspetto reale --------
  const hero = src.hero;
  const heroRatio = hero.width / hero.height;
  console.log(`Hero: rapporto d'aspetto reale ${heroRatio.toFixed(4)} — altezze derivate, non hardcoded.`);

  for (const { width, formats } of HERO_WIDTHS) {
    if (width > hero.width) {
      const msg =
        `variante ${width}px SALTATA: il sorgente ${hero.file} è largo ` +
        `${hero.width}px, generarla richiederebbe upscaling.`;
      warnings.push(msg);
      console.log(`  ! ${msg}`);
      continue;
    }
    const height = Math.round(width / heroRatio);
    console.log(`  -> ${width}x${height} (${formats.join(', ')})`);
    for (const format of formats) {
      const options =
        format === 'avif'
          ? { quality: Q.heroAvif }
          : format === 'webp'
            ? { quality: Q.heroWebp }
            : { quality: Q.heroJpg, progressive: true, mozjpeg: true };
      await emit({
        name: `hero-bg-${width}.${format}`,
        input: hero.buf,
        width,
        height,
        format,
        options,
        originalBytes: hero.bytes,
      });
    }
  }

  // --- 3. founder: stesse dimensioni del sorgente, solo ricodifica ---
  const founder = src.founder;
  console.log(`\nFounder: ${founder.width}x${founder.height} (dimensioni invariate, sola ricodifica)`);
  await emit({
    name: 'founder.avif',
    input: founder.buf,
    format: 'avif',
    options: { quality: Q.founderAvif },
    originalBytes: founder.bytes,
  });
  await emit({
    name: 'founder.webp',
    input: founder.buf,
    format: 'webp',
    options: { quality: Q.founderWebp },
    originalBytes: founder.bytes,
  });

  // --- 4. logo: alpha preservato -------------------------------------
  const logo = src.logo;
  console.log(`Logo:    ${logo.width}x${logo.height} (dimensioni invariate, alpha preservato)`);
  await emit({
    name: 'logo.avif',
    input: logo.buf,
    format: 'avif',
    // alpha è preservato: nessun flatten, nessuno sfondo imposto.
    options: { quality: Q.logoAvif },
    originalBytes: logo.bytes,
  });
  await emit({
    name: 'logo.webp',
    input: logo.buf,
    format: 'webp',
    options: { quality: Q.logoWebp, alphaQuality: 100 },
    originalBytes: logo.bytes,
  });

  // verifica che l'alpha sia sopravvissuto alla conversione
  for (const name of ['logo.avif', 'logo.webp']) {
    const meta = await sharp(join(ASSETS, name)).metadata();
    if (!meta.hasAlpha) {
      warnings.push(`${name}: canale alpha PERSO nella conversione.`);
    }
  }

  // --- 5. tabella finale ---------------------------------------------
  const w = {
    name: Math.max(4, ...rows.map((r) => r.name.length)),
    dim: Math.max(10, ...rows.map((r) => `${r.width}x${r.height}`.length)),
    size: 9,
    delta: 12,
  };
  console.log('\n' + '-'.repeat(w.name + w.dim + w.size + w.delta + 9));
  console.log(
    `  ${pad('File', w.name)}  ${pad('Dimensioni', w.dim)}  ` +
      `${padLeft('Peso', w.size)}  ${padLeft('vs originale', w.delta)}`
  );
  console.log('-'.repeat(w.name + w.dim + w.size + w.delta + 9));
  for (const r of rows) {
    const delta = ((r.bytes - r.originalBytes) / r.originalBytes) * 100;
    const sign = delta > 0 ? '+' : '';
    console.log(
      `  ${pad(r.name, w.name)}  ${pad(`${r.width}x${r.height}`, w.dim)}  ` +
        `${padLeft(fmtBytes(r.bytes), w.size)}  ${padLeft(`${sign}${delta.toFixed(1)} %`, w.delta)}`
    );
  }
  console.log('-'.repeat(w.name + w.dim + w.size + w.delta + 9));
  console.log(
    `  Originali: ` +
      Object.values(src).map((s) => `${s.file} ${fmtBytes(s.bytes)}`).join('  |  ')
  );

  if (warnings.length) {
    console.log('\nAVVISI:');
    for (const msg of warnings) console.log(`  ! ${msg}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
