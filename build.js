#!/usr/bin/env node
'use strict';

// Build statico del sito AURA — solo moduli core di Node.
// Genera dist/<lang>/index.html per ogni lingua a partire da
// src/template.html + src/translations.js.

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const SRC  = path.join(ROOT, 'src');
const DIST = path.join(ROOT, 'dist');

const LANGS = ['it', 'en', 'de', 'fr', 'es'];

// Copiati nella root di dist/.
const COPY = ['assets', 'style.css', 'script.js'];

// Non devono MAI finire in dist/, a nessuna profondità.
const EXCLUDE = new Set([
  '_archive', 'src', '.git', 'node_modules',
  'build.js', 'CLAUDE.md', 'README', 'README.md', 'dist'
]);

// Etichette del selettore lingua: endonimi, identici in tutte e cinque le
// pagine, quindi non sono copy traducibile e restano qui. L'ordine e' quello
// approvato nel design e non va cambiato.
const LANG_OPTIONS = [
  ['en', 'English'],
  ['de', 'Deutsch'],
  ['it', 'Italiano'],
  ['fr', 'Français'],
  ['es', 'Español']
];

// Le uniche stringhe che servono a runtime: gli esiti dell'invio del form.
// Vengono iniettate inline, solo per la lingua della pagina.
const RUNTIME_KEYS = ['sending', 'success', 'error'];

// Segnaposto risolti dal build, non dalle traduzioni.
const BUILTIN = new Set([
  'LANG', 'LANG_UPPER', 'TITLE', 'DESCRIPTION', 'PRIVACY_URL',
  'LANG_OPTIONS', 'I18N_SCRIPT'
]);

// Segnaposto il cui valore e' gia' markup e non va escapato.
const RAW = new Set(['LANG_OPTIONS', 'I18N_SCRIPT']);

const PLACEHOLDER = /\{\{\s*([^}\s]+)\s*\}\}/g;

function fail(title, detail) {
  console.error('\nBUILD FALLITO — ' + title + '\n');
  if (detail) console.error(detail.split('\n').map(l => '  ' + l).join('\n') + '\n');
  process.exit(1);
}

function loadTranslations() {
  const code = fs.readFileSync(path.join(SRC, 'translations.js'), 'utf8');
  return new Function(code + '\nreturn translations;')();
}

function getPath(obj, p) {
  return p.split('.').reduce((o, k) => (o && o[k] !== undefined ? o[k] : undefined), obj);
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Script inline con le sole stringhe di runtime della lingua corrente.
// "<" viene neutralizzato: una sequenza "</script>" dentro una traduzione
// chiuderebbe il tag in anticipo.
function buildI18nScript(t) {
  const payload = {};
  for (const k of RUNTIME_KEYS) payload[k] = getPath(t, 'contact.' + k);
  const json = JSON.stringify(payload).replace(/</g, '\\u003c');
  return '<script>window.AURA_I18N=' + json + ';<\/script>';
}

// Fallback per "/" quando la Function di routing non risponde.
// Non deve essere indicizzato: le pagine vere sono /<lang>/.
function buildRootFallback() {
  const links = LANG_OPTIONS
    .map(([code, label]) => '  <li><a href="/' + code + '/">' + escapeHtml(label) + '</a></li>')
    .join('\n');
  return [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="UTF-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
    '<meta name="robots" content="noindex">',
    '<title>AURA</title>',
    '<script>location.replace("/en/");<\/script>',
    '</head>',
    '<body>',
    '<ul>',
    links,
    '</ul>',
    '</body>',
    '</html>',
    ''
  ].join('\n');
}

// ---------- guardia (a): chiavi mancanti ----------
function validateKeys(template, translations) {
  const keys = [...new Set([
    // segnaposto presenti nel template
    ...[...template.matchAll(PLACEHOLDER)].map(m => m[1]).filter(k => !BUILTIN.has(k)),
    // chiavi consumate a runtime via window.AURA_I18N: non compaiono nel
    // template, ma se mancassero il form resterebbe muto senza avvisare
    ...RUNTIME_KEYS.map(k => 'contact.' + k),
    // usate dal build per <title> e <meta name="description">
    'seo.title', 'seo.description'
  ])];

  const problems = [];
  for (const lang of LANGS) {
    if (!translations[lang]) {
      problems.push(`lingua "${lang}" assente in src/translations.js`);
      continue;
    }
    for (const k of keys) {
      const v = getPath(translations[lang], k);
      if (v === undefined) {
        problems.push(`[${lang}] chiave mancante: ${k}`);
      } else if (typeof v !== 'string' && !Array.isArray(v)) {
        problems.push(`[${lang}] ${k} non è una stringa né un array (è ${typeof v})`);
      }
    }
  }
  if (problems.length) {
    fail(
      `${problems.length} chiave/i usata/e nel template ma non risolvibile/i`,
      problems.join('\n') +
      `\n\nControllate ${keys.length} chiavi × ${LANGS.length} lingue.`
    );
  }
  return keys;
}

// ---------- rendering ----------
function render(template, lang, translations) {
  const t = translations[lang];
  const builtin = {
    LANG: lang,
    LANG_UPPER: lang.toUpperCase(),
    TITLE: getPath(t, 'seo.title'),
    DESCRIPTION: getPath(t, 'seo.description'),
    // URL, non percorso filesystem: sempre forward slash.
    PRIVACY_URL: '/' + lang + '/privacy/',
    LANG_OPTIONS: LANG_OPTIONS.map(([code, label]) =>
      '<option value="/' + code + '/"' + (code === lang ? ' selected' : '') + '>' +
      escapeHtml(label) + '</option>'
    ).join(''),
    I18N_SCRIPT: buildI18nScript(t)
  };

  return template.replace(PLACEHOLDER, (_, key) => {
    if (RAW.has(key)) return builtin[key];
    if (BUILTIN.has(key)) return escapeHtml(builtin[key]);
    const v = getPath(t, key);
    if (Array.isArray(v)) {
      return v.map(item => '<li>' + escapeHtml(item) + '</li>').join('\n            ');
    }
    return escapeHtml(v);
  });
}

// ---------- guardia (b) + controlli sull'output ----------
function verifyOutput(html, label) {
  const left = html.match(/\{\{[^}]*\}\}/g);
  if (left) {
    fail('segnaposto non risolti in ' + label,
      [...new Set(left)].join('\n'));
  }
  const i18n = html.match(/data-i18n[a-z-]*=/g);
  if (i18n) {
    fail('attributi data-i18n* residui in ' + label,
      i18n.length + ' occorrenze: il template non è stato convertito del tutto');
  }
  // Mai backslash negli URL: sarebbe un path Windows finito in un href.
  const bs = html.match(/(?:href|src)="[^"]*\\[^"]*"/g);
  if (bs) {
    fail('backslash in un URL di ' + label, bs.join('\n'));
  }
}

// ---------- copia ----------
function copyRecursive(from, to) {
  if (EXCLUDE.has(path.basename(from))) return 0;
  const st = fs.statSync(from);
  if (st.isDirectory()) {
    fs.mkdirSync(to, { recursive: true });
    let n = 0;
    for (const entry of fs.readdirSync(from)) {
      n += copyRecursive(path.join(from, entry), path.join(to, entry));
    }
    return n;
  }
  fs.copyFileSync(from, to);
  return 1;
}

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

// ---------- main ----------
function build() {
  const t0 = process.hrtime.bigint();

  const translations = loadTranslations();
  const template = fs.readFileSync(path.join(SRC, 'template.html'), 'utf8');

  const keys = validateKeys(template, translations);

  // Idempotenza: dist/ viene sempre ricreato da zero.
  fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(DIST, { recursive: true });

  let copied = 0;
  for (const item of COPY) {
    const from = path.join(ROOT, item);
    if (!fs.existsSync(from)) fail('risorsa da copiare mancante', item);
    copied += copyRecursive(from, path.join(DIST, item));
  }

  for (const lang of LANGS) {
    const html = render(template, lang, translations);
    verifyOutput(html, `dist/${lang}/index.html`);
    fs.mkdirSync(path.join(DIST, lang), { recursive: true });
    fs.writeFileSync(path.join(DIST, lang, 'index.html'), html);
  }

  fs.writeFileSync(path.join(DIST, 'index.html'), buildRootFallback());

  // Nessun nome escluso deve essere finito in dist/.
  for (const f of walk(DIST)) {
    const rel = path.relative(DIST, f);
    for (const seg of rel.split(path.sep)) {
      if (EXCLUDE.has(seg)) fail('file escluso finito in dist/', rel);
    }
  }

  const files = walk(DIST);
  const bytes = files.reduce((s, f) => s + fs.statSync(f).size, 0);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;

  console.log('build ok');
  console.log(`  ${LANGS.length} pagine   ${LANGS.map(l => '/' + l + '/').join(' ')}`);
  console.log(`  ${keys.length} chiavi risolte per lingua`);
  console.log(`  ${copied} file copiati`);
  console.log(`  ${files.length} file totali in dist/  (${(bytes / 1024).toFixed(1)} KB)`);
  console.log(`  ${ms.toFixed(0)} ms`);
}

build();
