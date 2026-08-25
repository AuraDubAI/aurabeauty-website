/**
 * tools/gen-og-image.mjs — generazione one-shot della card social 1200x630.
 *
 * NON fa parte del build. Richiede sharp installato in locale con
 * `npm install --no-save sharp`. Non tocca build.js, il template o dist/.
 *
 * Uso: node tools/gen-og-image.mjs                 riproduce assets/og-image.jpg
 *      node tools/gen-og-image.mjs --out X.png     scrive altrove (candidati)
 *      node tools/gen-og-image.mjs --crop right    modalita' di ritaglio
 *      node tools/gen-og-image.mjs --logo          compone assets/logo.png sopra
 *      node tools/gen-og-image.mjs --scale 0.66    intensita' dello scurimento
 *
 * SORGENTI: esclusivamente assets/hero-bg.jpg (1920x1080, originale) e
 * assets/logo.png (600x315, RGBA). Le varianti hero-bg-{768,1280,1920}.
 * {avif,webp,jpg} sono ricompressioni per il responsive del browser:
 * partire da quelle aggiungerebbe una generazione di perdita inutile.
 * 1920x1080 basta per un 1200x630 senza upscaling (crop 'full').
 *
 * PERCHE' IL LOGO NON SI COMPONE (--logo e' opt-in, non predefinito):
 * hero-bg.jpg ha GIA' il marchio "aura dubAI" impresso nei pixel in alto
 * a sinistra — wordmark x 374..982 y 126..251, orb x 254..572 y 33..315,
 * sottotitolo fino a x~990 — e assets/logo.png e' lo stesso wordmark.
 * Comporlo sopra darebbe due loghi nella stessa card. Non e' aggirabile
 * col ritaglio: il marchio occupa la fascia alta-sinistra e la testa del
 * robot quella alta-destra, quindi ogni finestra 1.905:1 che escluda il
 * primo taglia la seconda. Spegnere il marchio con una toppa scura non
 * funziona (traspare e lascia una chiazza): servirebbe inpainting, che
 * sharp non fa. La card usa quindi il marchio impresso, che e' anche
 * quello che l'utente vede aprendo la home.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const ASSETS = join(ROOT, 'assets');

const OG_W = 1200;
const OG_H = 630;                 // 1.90476:1, il rapporto che Open Graph vuole
const LOGO_W = 440;               // ~37% della larghezza card
const KERNEL = 'lanczos3';
const MAX_BYTES = 250 * 1024;     // oltre questa soglia si passa a JPEG q82
const JPEG_Q = 82;

// Lo scurimento della pagina, misurato sul CSS della hero:
//   .hero-bg img { opacity: 0.5 }  su  --bg #0a0a12
//   .hero-overlay = due gradienti sovrapposti, il primo sopra:
//     G1 180deg: rgba(10,10,18,.55) 0% -> .85 60% -> #0a0a12 (1.0) 100%
//     G2  90deg: rgba(10,10,18,.9)  0% -> .35 55% (poi costante)
// Al centro della card G1=0.80 e G2=0.40, quindi l'overlay copre
//   1-(1-.80)(1-.40) = 0.88
// e dell'immagine resta 0.5*(1-0.88) = 0.06, cioe' il 6%.
//
// Replicare 0.94 di nero darebbe una card praticamente nera: illeggibile
// come immagine e inutile come anteprima. SCALE rimappa gli estremi dei
// due gradienti conservandone la forma (alto piu' chiaro, basso e sinistra
// piu' scuri), cosi' la card resta parente della hero senza annerirsi.
//
// 0.45 e' il valore scelto: al centro copre il 48% e lascia il marchio
// impresso nettamente leggibile anche in miniatura. A 0.66 il marchio
// si slavava, ed e' il marchio l'unico elemento di brand della card.
const SCALE = 0.45;

// Estremi dei due gradienti a SCALE=1 (i valori del CSS).
const G1 = { a: 0.55, b: 0.85, bAt: 0.60, c: 1.0 };   // verticale
const G2 = { a: 0.90, b: 0.35, bAt: 0.55 };           // orizzontale

const INK = { r: 10, g: 10, b: 18 };                  // --bg #0a0a12

// ---------- argomenti ----------

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf('--' + name);
  return i === -1 ? fallback : argv[i + 1];
};
const flag = (name) => argv.includes('--' + name);

const CROP = arg('crop', 'attention');
const OUT = arg('out', join(ASSETS, 'og-image.jpg'));
const WITH_LOGO = flag('logo');
const scale = Number(arg('scale', SCALE));
const LOGO_POS = arg('logo-pos', 'centre');   // 'centre' | 'mark'
const SUPPRESS = flag('suppress');

// hero-bg.jpg ha GIA' il marchio "aura dubAI" impresso nei pixel, in alto
// a sinistra. Misurato sui pixel magenta e sul glow: wordmark x 374..982
// y 126..251, glow x 254..572 y 33..315, sottotitolo fino a x~990 y~310.
// In coordinate 1200x630 (crop 'attention': scala .625, offset top 0):
const MARK = { x0: 150, y0: 5, x1: 630, y1: 210 };

// ---------- ritaglio ----------

/**
 * 'full' mantiene tutta la larghezza: 1920x1080 -> 1920x1008 (si tagliano
 * 72 righe, il 6.7%) e poi si scende a 1200x630. Nessun upscaling.
 * 'attention' e 'entropy' sono le due strategie di sharp per decidere
 * QUALI 72 righe sacrificare. 'centre' taglia simmetricamente.
 * 'right' isola il robot escludendo il marchio impresso nell'angolo
 * alto-sinistra, ma per farlo deve ingrandire (~1.30x).
 */
async function crop(buf) {
  if (CROP === 'right') {
    // Il marchio impresso arriva a x~1000. Partire da x=1000 lascia
    // 920px di larghezza -> 483 di altezza a 1.90476:1, da portare a
    // 1200x630: ingrandimento 1.304x.
    const left = 1000;
    const width = 920;
    const height = Math.round(width / (OG_W / OG_H));   // 483
    const top = Math.round((1080 - height) / 2);
    return sharp(buf)
      .extract({ left, top, width, height })
      .resize(OG_W, OG_H, { kernel: KERNEL });
  }

  const position =
    CROP === 'centre' ? 'centre' :
    CROP === 'entropy' ? sharp.strategy.entropy :
    sharp.strategy.attention;

  return sharp(buf).resize(OG_W, OG_H, { fit: 'cover', position, kernel: KERNEL });
}

// ---------- scurimento ----------

/** Alpha del gradiente verticale del CSS, a y normalizzato in [0,1]. */
function vertical(t) {
  if (t <= G1.bAt) return G1.a + (G1.b - G1.a) * (t / G1.bAt);
  return G1.b + (G1.c - G1.b) * ((t - G1.bAt) / (1 - G1.bAt));
}

/** Alpha del gradiente orizzontale del CSS, a x normalizzato in [0,1]. */
function horizontal(t) {
  if (t >= G2.bAt) return G2.b;
  return G2.a + (G2.b - G2.a) * (t / G2.bAt);
}

/** Overlay RGBA: stesso colore e stessa forma della hero, intensita' scalata. */
function overlay(w, h, k) {
  const px = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    const v = vertical(h === 1 ? 0 : y / (h - 1)) * k;
    for (let x = 0; x < w; x++) {
      const g = horizontal(w === 1 ? 0 : x / (w - 1)) * k;
      const a = 1 - (1 - v) * (1 - g);        // G1 sopra G2
      const o = (y * w + x) * 4;
      px[o] = INK.r; px[o + 1] = INK.g; px[o + 2] = INK.b;
      px[o + 3] = Math.round(Math.min(1, Math.max(0, a)) * 255);
    }
  }
  return { raw: px, info: { width: w, height: h, channels: 4 } };
}

/**
 * Toppa scura sfumata sopra il marchio impresso, per spegnerlo prima di
 * comporre il logo pulito. Bordi ammorbiditi su FEATHER px: uno spigolo
 * netto si leggerebbe come un rettangolo appiccicato sulla foto.
 */
function suppressPatch(box, feather = 90) {
  const w = OG_W, h = OG_H;
  const px = Buffer.alloc(w * h * 4);
  const ramp = (d) => Math.min(1, Math.max(0, d / feather));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // distanza dentro il rettangolo, 0 sul bordo
      const dx = Math.min(x - box.x0, box.x1 - x);
      const dy = Math.min(y - box.y0, box.y1 - y);
      let a = 0;
      if (dx > -feather && dy > -feather) a = ramp(dx) * ramp(dy);
      const o = (y * w + x) * 4;
      px[o] = INK.r; px[o + 1] = INK.g; px[o + 2] = INK.b;
      px[o + 3] = Math.round(a * 255);
    }
  }
  return { raw: px, info: { width: w, height: h, channels: 4 } };
}

/** Quota di nero al centro della card, per il rapporto a schermo. */
function centreDarkness(k) {
  const a = 1 - (1 - vertical(0.5) * k) * (1 - horizontal(0.5) * k);
  return a;
}

// ---------- logo ----------

async function logoLayer() {
  const src = await readFile(join(ASSETS, 'logo.png'));
  const meta = await sharp(src).metadata();
  if (!meta.hasAlpha) {
    throw new Error(
      'assets/logo.png non ha canale alpha: composto sopra la foto ' +
      'produrrebbe un rettangolo bianco. Interrotto.'
    );
  }
  const buf = await sharp(src)
    .resize({ width: LOGO_W, kernel: KERNEL, fit: 'inside', withoutEnlargement: false })
    .png({ compressionLevel: 9 })
    .toBuffer();

  const after = await sharp(buf).metadata();
  if (!after.hasAlpha) {
    throw new Error('canale alpha PERSO nel ridimensionamento del logo. Interrotto.');
  }

  // Controllo esplicito: gli angoli devono restare trasparenti.
  const { data, info } = await sharp(buf).ensureAlpha().raw()
    .toBuffer({ resolveWithObject: true });
  const alphaAt = (x, y) => data[(y * info.width + x) * 4 + 3];
  const corners = [
    alphaAt(0, 0), alphaAt(info.width - 1, 0),
    alphaAt(0, info.height - 1), alphaAt(info.width - 1, info.height - 1),
  ];
  if (corners.some((a) => a > 8)) {
    throw new Error(
      'gli angoli del logo ridimensionato non sono trasparenti (alpha ' +
      corners.join(',') + '): ci sarebbe un box opaco. Interrotto.'
    );
  }
  return { buf, width: info.width, height: info.height, corners };
}

// ---------- main ----------

async function main() {
  const heroBuf = await readFile(join(ASSETS, 'hero-bg.jpg'));
  const heroMeta = await sharp(heroBuf).metadata();

  const base = await crop(heroBuf);
  const cropped = await base.png().toBuffer();

  const ov = overlay(OG_W, OG_H, scale);
  const layers = [{
    input: ov.raw,
    raw: ov.info,
    blend: 'over',
  }];

  if (SUPPRESS) {
    const sp = suppressPatch(MARK);
    layers.push({ input: sp.raw, raw: sp.info, blend: 'over' });
  }

  let logo = null;
  if (WITH_LOGO) {
    logo = await logoLayer();
    if (LOGO_POS === 'mark') {
      // centrato sul riquadro del marchio impresso, cosi' lo rimpiazza
      const cx = (MARK.x0 + MARK.x1) / 2, cy = (MARK.y0 + MARK.y1) / 2;
      layers.push({
        input: logo.buf,
        left: Math.round(cx - logo.width / 2),
        top: Math.round(cy - logo.height / 2),
      });
    } else {
      layers.push({ input: logo.buf, gravity: 'centre' });
    }
  }

  const asJpeg = () => sharp(cropped).composite(layers)
    .flatten({ background: INK })
    .jpeg({ quality: JPEG_Q, mozjpeg: true, chromaSubsampling: '4:4:4' })
    .toBuffer();

  let out, note = '';
  let target = OUT;

  if (/\.jpe?g$/i.test(OUT)) {
    // Un 1200x630 fotografico in PNG sta intorno al megabyte: per questa
    // card il JPEG e' la scelta, non un ripiego.
    out = await asJpeg();
  } else {
    out = await sharp(cropped).composite(layers)
      .png({ compressionLevel: 9, palette: false }).toBuffer();
    if (out.length > MAX_BYTES) {
      const jpg = await asJpeg();
      note = `PNG ${(out.length / 1024).toFixed(1)} KB oltre i ${MAX_BYTES / 1024} KB` +
             ` -> emesso JPEG q${JPEG_Q} (${(jpg.length / 1024).toFixed(1)} KB)`;
      out = jpg;
      target = OUT.replace(/\.png$/i, '.jpg');
    }
  }

  await writeFile(target, out);

  const meta = await sharp(out).metadata();
  console.log('sorgente   hero-bg.jpg  ' + heroMeta.width + 'x' + heroMeta.height);
  console.log('ritaglio   ' + CROP);
  console.log('scurimento scale=' + scale +
              '  (al centro ' + (centreDarkness(scale) * 100).toFixed(0) + '% di nero,' +
              ' la pagina ne ha ' + (centreDarkness(1) * 100).toFixed(0) + '%' +
              ' piu\' opacity .5 sull\'img = 94%)');
  if (logo) {
    console.log('logo       ' + logo.width + 'x' + logo.height +
                '  alpha angoli [' + logo.corners.join(',') + ']  ' + KERNEL);
  } else {
    console.log('logo       non composto: hero-bg.jpg ha gia\' il marchio impresso');
  }
  console.log('uscita     ' + target);
  console.log('           ' + meta.width + 'x' + meta.height + '  ' + meta.format +
              '  ' + (out.length / 1024).toFixed(1) + ' KB');
  if (note) console.log('nota       ' + note);
}

main().catch((err) => {
  console.error('ERRORE: ' + err.message);
  process.exit(1);
});
