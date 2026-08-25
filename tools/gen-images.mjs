/**
 * tools/gen-images.mjs — generazione one-shot degli asset immagine.
 *
 * NON fa parte del build. Richiede sharp installato in locale con
 * `npm install --no-save sharp`. Non tocca build.js, il template o dist/.
 *
 * Uso: node tools/gen-images.mjs          rigenera tutte le varianti
 *      node tools/gen-images.mjs logo     rigenera solo il logo
 *      node tools/gen-images.mjs hero     ecc.
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
};

// Il logo e' servito da un sorgente RIDOTTO, non dal PNG a piena
// risoluzione. E' mostrato a 30px di altezza nell'header e 22px nel
// footer: i 315px dell'originale sono ~10x piu' del necessario, e nessuna
// scelta di codec recupera quello che si spreca in risoluzione.
//
// 90px = 3x DPR sull'altezza di resa maggiore. La larghezza la deriva
// sharp dal rapporto d'aspetto reale del PNG: non va scritta a mano.
const LOGO_HEIGHT = 90;

// lanczos3 e' il kernel di sharp per il downscale. Dichiarato
// esplicitamente perche' e' una scelta: su bordi antialiasati un kernel
// piu' morbido impasterebbe proprio i pixel che danno la forma.
const LOGO_KERNEL = 'lanczos3';

// UN SOLO formato, e non e' una semplificazione pigra: e' il risultato
// della misura. A 171x90 il PNG quantizzato a 256 colori pesa 4.4 KB e
// rende 51.88 dB PSNR alla dimensione di resa; AVIF q70 pesa 4.2 KB e
// rende 51.89 dB. Duecento byte di differenza. Servire tre formati per
// 0.2 KB significa un <picture> con tre <source>, tre file da rigenerare
// e mantenere allineati, e tre modi di sbagliare: complessita' senza
// guadagno. Con un solo PNG il markup torna a essere un <img>.
//
// 256 e' il pavimento della quantizzazione, non un valore arrotondato:
// a 128 colori il file scende a 1.3 KB ma il PSNR crolla a 32 dB e il
// gradiente del marchio inizia a fasciarsi. Non scendere sotto.
const LOGO_COLOURS = 256;
const LOGO = {
  // dither 1.0 e' il default di sharp e va bene: distribuisce l'errore di
  // quantizzazione sul gradiente invece di concentrarlo in bande.
  png: { compressionLevel: 9, effort: 10, palette: true, colours: LOGO_COLOURS, dither: 1 },
};

// Bersaglio opzionale. Senza argomenti rigenera tutto; con "logo" tocca
// solo logo-90.png e lascia gli altri dieci file dove sono.
const GROUPS = ['hero', 'founder', 'logo'];
const ONLY = process.argv[2] || null;
if (ONLY && !GROUPS.includes(ONLY)) {
  console.error(`bersaglio sconosciuto: ${ONLY}`);
  console.error(`ammessi: ${GROUPS.join(', ')} — oppure nessuno per rigenerare tutto`);
  process.exit(1);
}
const wants = (group) => ONLY === null || ONLY === group;

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

async function emit({ group, name, input, width, height, format, options, originalBytes }) {
  // Un gruppo non richiesto non viene nemmeno codificato: i file gia' su
  // disco restano esattamente quelli, byte per byte.
  if (!wants(group)) return;
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
  if (wants('hero')) {
    console.log(`Hero: rapporto d'aspetto reale ${heroRatio.toFixed(4)} — altezze derivate, non hardcoded.`);
  }

  for (const { width, formats } of HERO_WIDTHS) {
    if (!wants('hero')) continue;
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
        group: 'hero',
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
  if (wants('founder')) {
    console.log(`\nFounder: ${founder.width}x${founder.height} (dimensioni invariate, sola ricodifica)`);
  }
  await emit({
    group: 'founder',
    name: 'founder.avif',
    input: founder.buf,
    format: 'avif',
    options: { quality: Q.founderAvif },
    originalBytes: founder.bytes,
  });
  await emit({
    group: 'founder',
    name: 'founder.webp',
    input: founder.buf,
    format: 'webp',
    options: { quality: Q.founderWebp },
    originalBytes: founder.bytes,
  });

  // --- 4. logo: un solo PNG quantizzato ------------------------------
  const logo = src.logo;
  if (wants('logo')) {
    // Il ridimensionamento vero e proprio. Solo height: la larghezza la
    // deriva sharp dal rapporto d'aspetto reale del sorgente.
    const truecolor = await sharp(logo.buf)
      .resize({ height: LOGO_HEIGHT, kernel: LOGO_KERNEL, withoutEnlargement: true })
      .png({ compressionLevel: 9, effort: 10, palette: false })
      .toBuffer();

    // La quantizzazione parte dal ridimensionato, non dall'originale:
    // quantizzare prima e ridurre dopo impasterebbe la palette.
    const small = await sharp(truecolor).png(LOGO.png).toBuffer();
    const sm = await sharp(small).metadata();
    if (!sm.hasAlpha) {
      warnings.push('logo-90.png: canale alpha PERSO nel ridimensionamento.');
    }
    await writeFile(join(ASSETS, 'logo-90.png'), small);
    rows.push({
      name: 'logo-90.png', width: sm.width, height: sm.height,
      bytes: small.length, originalBytes: logo.bytes,
    });
    console.log(
      `Logo:    ${logo.width}x${logo.height} -> ${sm.width}x${sm.height} ` +
      `(${LOGO_KERNEL}, ratio derivato, alpha preservato)`
    );
    console.log(
      `  truecolor ${fmtBytes(truecolor.length)} -> ` +
      `${LOGO_COLOURS} colori ${fmtBytes(small.length)}`
    );

    // La quantizzazione e' lossy: si verifica che regga ALLA DIMENSIONE DI
    // RESA, non a 90px. Quei 90 pixel nessuno li guarda 1:1 — il logo e'
    // alto 30px nell'header e 22px nel footer.
    const RENDER_H = 30;
    const PSNR_MIN = 45;
    const atRender = async (buf) => {
      const { data, info } = await sharp(buf).ensureAlpha().raw()
        .toBuffer({ resolveWithObject: true });
      // Decodifica completa e POI resize: senza questo passaggio alcuni
      // decoder scalano in proprio e il confronto misura loro, non il file.
      return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
        .resize({ height: RENDER_H, kernel: LOGO_KERNEL })
        .ensureAlpha().raw().toBuffer();
    };
    // PSNR premoltiplicato: sotto alpha basso l'RGB non e' osservabile,
    // confrontarlo grezzo darebbe un numero che non corrisponde a nulla.
    const ref = await atRender(truecolor);
    const got = await atRender(small);
    let se = 0, n = 0, max = 0;
    for (let k = 0; k < ref.length; k += 4) {
      const ra = ref[k + 3], ga = got[k + 3];
      for (let c = 0; c < 3; c++) {
        const d = (ref[k + c] * ra) / 255 - (got[k + c] * ga) / 255;
        se += d * d; n++; if (Math.abs(d) > max) max = Math.abs(d);
      }
      const da = ra - ga;
      se += da * da; n++; if (Math.abs(da) > max) max = Math.abs(da);
    }
    const psnr = se === 0 ? Infinity : 10 * Math.log10((255 * 255) / (se / n));
    const label = psnr === Infinity ? 'identico' : psnr.toFixed(2) + ' dB';
    if (psnr < PSNR_MIN) {
      warnings.push(
        `logo-90.png: la quantizzazione a ${LOGO_COLOURS} colori rende ` +
        `PSNR ${label} a ${RENDER_H}px, sotto la soglia di ${PSNR_MIN} dB ` +
        `(scarto massimo ${max.toFixed(1)}/255).`
      );
    } else {
      console.log(
        `  quantizzazione verificata: PSNR ${label} a ${RENDER_H}px di resa, ` +
        `scarto massimo ${max.toFixed(1)}/255`
      );
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
      Object.entries(src)
        .filter(([group]) => wants(group))
        .map(([, s]) => `${s.file} ${fmtBytes(s.bytes)}`)
        .join('  |  ')
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
