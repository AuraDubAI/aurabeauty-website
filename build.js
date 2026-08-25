#!/usr/bin/env node
'use strict';

// Build statico del sito AURA — solo moduli core di Node.
// Genera dist/<lang>/index.html per ogni lingua a partire da
// src/template.html + src/translations.js.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
const SRC  = path.join(ROOT, 'src');
const DIST = path.join(ROOT, 'dist');

const LANGS = ['it', 'en', 'de', 'fr', 'es'];

// Base URL di produzione: unica fonte per canonical, hreflang, OG, JSON-LD,
// sitemap e robots.txt. Cambiare dominio significa cambiare solo questa riga.
const BASE_URL = 'https://info.aurabeauty.app';
const X_DEFAULT = 'en';

// Card social 1200x630, generata da tools/gen-og-image.mjs a partire da
// assets/hero-bg.jpg. JPEG e non PNG: e' un ritaglio fotografico, in PNG
// pesava 980 KB contro 74. Cambiando formato va aggiornato anche
// OG_IMAGE_TYPE qui sotto.
const OG_IMAGE = '/assets/og-image.jpg';   // 1200x630
const OG_IMAGE_TYPE = 'image/jpeg';
const OG_LOCALES = { it: 'it_IT', en: 'en_US', de: 'de_DE', fr: 'fr_FR', es: 'es_ES' };

const pageUrl = lang => BASE_URL + '/' + lang + '/';
const privacyUrl = lang => BASE_URL + '/' + lang + '/privacy/';

// Data di <lastmod> nella sitemap. Costante e non new Date(): una data che
// cambia a ogni esecuzione romperebbe l'idempotenza del build. Aggiornare a
// mano quando i contenuti cambiano, o passare SOURCE_DATE_EPOCH da CI.
const BUILD_DATE = process.env.SOURCE_DATE_EPOCH
  ? new Date(Number(process.env.SOURCE_DATE_EPOCH) * 1000).toISOString().slice(0, 10)
  : '2026-08-25';

// Copiati verbatim nella root di dist/: nomi stabili, contenuto immutabile
// di fatto (le immagini e i font non cambiano senza cambiare nome).
const COPY = ['assets'];

// Asset mutabili: emessi con l'hash del contenuto nel nome, cosi' possono
// avere cache lunga senza rischiare di servire una versione vecchia dopo un
// deploy. Le versioni senza hash NON finiscono in dist/.
const FINGERPRINTED = [
  { src: 'style.css',  base: 'style',  ext: 'css', urlKey: 'STYLE_URL'  },
  { src: 'script.js',  base: 'script', ext: 'js',  urlKey: 'SCRIPT_URL' }
];

function fingerprint(entry) {
  const buf = fs.readFileSync(path.join(ROOT, entry.src));
  const hash = crypto.createHash('sha256').update(buf).digest('hex').slice(0, 8);
  const out = entry.base + '.' + hash + '.' + entry.ext;
  // URL assoluto: le pagine vivono in /<lang>/, un riferimento relativo
  // punterebbe a /it/style.<hash>.css e darebbe 404.
  return { ...entry, buf, hash, out, url: '/' + out };
}

// Non devono MAI finire in dist/, a nessuna profondità.
const EXCLUDE = new Set([
  '_archive', 'src', '.git', 'node_modules', 'functions',
  'build.js', 'serve.js', 'CLAUDE.md', 'README', 'README.md', 'dist',
  'package.json', 'package-lock.json', '.gitignore'
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

// CSS applicato SOLO quando lo scripting e' disattivato, servito dentro
// <noscript> nel <head>. Senza JavaScript il form non e' inviabile — e
// lasciarlo visibile sarebbe peggio che nasconderlo: il submit nativo
// spedirebbe nome, email e consenso nella query string, quindi in
// cronologia, log del CDN e header Referer.
//
// Vive qui e non in style.css perche' e' inline, e la CSP dichiara
// style-src 'self' senza 'unsafe-inline': va autorizzato per hash. Con
// la stringa e il suo hash generati dalla stessa costante non possono
// divergere — se il CSS cambia, l'header cambia con lui.
const NOSCRIPT_CSS =
  // --- form: non inviabile, quindi nascosto ------------------------
  '.contact-form{display:none!important}' +
  '.form-noscript{display:block!important}' +

  // --- selettore lingua: inerte a ogni larghezza -------------------
  // Il <select> naviga solo perche' script.js ascolta 'change'. Con il
  // controllo nascosto la sua <label> sr-only resterebbe a puntare a un
  // elemento fuori dall'albero di accessibilita': va via con lui.
  '.lang-select,.main-nav label[for=lang-select]{display:none!important}' +

  // --- navigazione su mobile ---------------------------------------
  // Sotto i 720px .main-nav e' un overlay che si apre solo con la classe
  // .open aggiunta da JS: senza scripting i cinque link della pagina
  // sono irraggiungibili. Non basta renderlo visibile — resterebbe
  // position:absolute dentro un header sticky, cioe' un pannello opaco
  // fisso sopra il contenuto. Va riportato nel flusso.
  //
  // Sopra i 720px non serve nulla: la nav e' gia' una riga visibile.
  '@media(max-width:720px){' +
    // L'header diventa due righe: logo sopra, nav sotto. height:auto
    // perche' i 76px fissi conterrebbero solo la prima.
    '.header-inner{flex-wrap:wrap;height:auto}' +
    '.main-nav{' +
      // neutralizzazione dell'overlay
      'position:static;opacity:1;pointer-events:auto;transform:none;' +
      'background:none;backdrop-filter:none;border-bottom:0;' +
      // layout in flusso: riga a capo invece di colonna, cosi' cinque
      // voci occupano due righe invece di cinque. I gutter orizzontali
      // li da' gia' .container, quindi il padding proprio va azzerato.
      'width:100%;flex-direction:row;flex-wrap:wrap;' +
      'padding:0 0 14px;gap:10px 18px' +
    '}' +
    // L'hamburger senza JS non apre nulla: accanto a una nav gia'
    // aperta sarebbe un comando che mente.
    '.nav-toggle{display:none!important}' +
  '}';

const noscriptStyle = () =>
  '<noscript><style>' + NOSCRIPT_CSS + '</style></noscript>';

// Hash del contenuto esatto del <style>, nella forma che la CSP vuole.
const noscriptCspHash = () =>
  "'sha256-" + crypto.createHash('sha256').update(NOSCRIPT_CSS).digest('base64') + "'";

// Le stringhe che servono a runtime: esito dell'invio e messaggi di
// validazione. Vengono iniettate inline, solo per la lingua della pagina.
//
// Percorsi completi, non nomi: da quando esistono form.err.* non stanno
// piu' tutte sotto contact. Il payload rispecchia l'annidamento, cosi'
// script.js legge i18n.form.err.emailInvalid con lo stesso percorso che
// la chiave ha in translations.js — un solo modello mentale.
//
// Qui stanno SOLO le stringhe che il JS sostituisce dentro un elemento
// esistente. I blocchi che il JS si limita a mostrare o nascondere (esito
// positivo, pulsante di ritenta) vivono nel template, gia' tradotti dal
// build: non ha senso spedirli come JSON e riscriverli a mano.
const RUNTIME_KEYS = [
  'contact.sending',
  'contact.error',
  'form.err.nameRequired',
  'form.err.nameTooShort',
  'form.err.emailRequired',
  'form.err.emailInvalid',
  'form.err.messageTooLong',
  'form.err.privacyRequired',
  'form.err.summary'
];

// Segnaposto risolti dal build, non dalle traduzioni.
const BUILTIN = new Set([
  'LANG', 'LANG_UPPER', 'TITLE', 'DESCRIPTION', 'PRIVACY_URL',
  'LANG_OPTIONS', 'I18N_SCRIPT', 'SEO_HEAD', 'STYLE_URL', 'SCRIPT_URL',
  'NOSCRIPT_STYLE', 'LANG_LINKS', 'HERO_TITLE',
  // solo nelle pagine legali
  'CANONICAL', 'HREFLANG_BLOCK', 'BODY', 'SOCIAL_BLOCK'
]);

// Segnaposto il cui valore e' gia' markup e non va escapato.
const RAW = new Set([
  'LANG_OPTIONS', 'I18N_SCRIPT', 'SEO_HEAD', 'HREFLANG_BLOCK', 'BODY', 'SOCIAL_BLOCK',
  'HERO_TITLE',
  'NOSCRIPT_STYLE', 'LANG_LINKS'
]);

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
  for (const path of RUNTIME_KEYS) {
    const parts = path.split('.');
    let node = payload;
    for (const k of parts.slice(0, -1)) node = node[k] || (node[k] = {});
    node[parts[parts.length - 1]] = getPath(t, path);
  }
  // L'ordine delle chiavi nel JSON e' quello di inserimento, cioe' quello
  // di RUNTIME_KEYS: costante fra un build e l'altro, quindi l'output non
  // cambia a parita' di sorgenti.
  const json = JSON.stringify(payload).replace(/</g, '\\u003c');
  return '<script>window.AURA_I18N=' + json + ';<\/script>';
}

// Blocco hreflang reciproco su un insieme OMOGENEO di pagine: le home fra
// loro, le privacy fra loro. urlFor decide quale insieme. Mescolarli
// (una privacy che rimanda alla home di un'altra lingua) romperebbe la
// reciprocita': non sono traduzioni l'una dell'altra.
function hreflangBlock(urlFor) {
  return LANGS
    .map(l => '<link rel="alternate" hreflang="' + l + '" href="' + urlFor(l) + '">')
    .concat('<link rel="alternate" hreflang="x-default" href="' + urlFor(X_DEFAULT) + '">')
    .join('\n');
}

// Le <option> del selettore lingua. urlFor sceglie la destinazione: dalla
// privacy italiana si passa alla privacy tedesca, non alla home tedesca.
function langOptions(lang, urlFor) {
  return LANG_OPTIONS.map(([code, label]) =>
    '<option value="' + urlFor(code) + '"' + (code === lang ? ' selected' : '') + '>' +
    escapeHtml(label) + '</option>'
  ).join('');
}

// Fallback del selettore lingua per chi non esegue JavaScript. Senza
// questo elenco chi non ha JS resta bloccato sulla lingua d'ingresso, e
// i crawler che non eseguono JS non trovano alcun link fra le versioni
// linguistiche — un link reale e' un segnale piu' forte della sola
// dichiarazione hreflang nel <head>.
//
// Prende lo stesso LANG_OPTIONS e lo stesso urlFor di langOptions: i due
// elenchi non possono divergere, e cambiando la forma degli URL si
// aggiornano insieme.
//
// Il codice a due lettere e' l'etichetta visibile, l'endonimo il nome
// accessibile: cinque endonimi per intero non stanno su una riga a 320px,
// ma non c'e' ragione di far perdere il nome della lingua a chi usa uno
// screen reader. aria-hidden sul codice evita il doppio annuncio.
function langLinks(lang, urlFor) {
  const items = LANG_OPTIONS.map(([code, label]) =>
    '<li><a href="' + urlFor(code) + '" hreflang="' + code + '"' +
    (code === lang ? ' aria-current="page"' : '') + '>' +
    '<span aria-hidden="true">' + escapeHtml(code.toUpperCase()) + '</span>' +
    '<span class="sr-only" lang="' + code + '">' + escapeHtml(label) + '</span>' +
    '</a></li>'
  ).join('');
  return '<noscript><div class="container lang-links-row">' +
    '<ul class="lang-links">' + items + '</ul></div></noscript>';
}

// Corpo di una pagina legale. Le sezioni sono dati, non markup:
// translations.js non contiene HTML. Ogni stringa e' escapata, quindi un
// < in un testo legale non puo' diventare un tag.
// L'indirizzo e' il recapito per esercitare i diritti: lasciarlo come
// testo semplice obbligava a copiarlo a mano. Si linkifica DOPO l'escape,
// e solo la stringa esatta e' letterale — non c'e' HTML che arrivi dalle
// traduzioni, quindi escapeHtml resta l'unica barriera e non viene
// aggirata.
const CONTACT_EMAIL = 'info@aurabeauty.app';

function linkifyEmail(escaped) {
  return escaped.split(CONTACT_EMAIL).join(
    '<a href="mailto:' + CONTACT_EMAIL + '">' + CONTACT_EMAIL + '</a>'
  );
}

function renderLegalBody(sections) {
  const out = [];
  for (const s of sections) {
    out.push('      <h2>' + escapeHtml(s.heading) + '</h2>');
    for (const p of s.paragraphs) {
      out.push('      <p>' + linkifyEmail(escapeHtml(p)) + '</p>');
    }
  }
  return out.join('\n');
}

// ---------- Open Graph + Twitter Card ----------
// Condiviso fra home e pagine legali. Prima viveva dentro buildSeoHead e
// quindi esisteva solo sulle home: condividere /it/privacy/ produceva una
// card grezza col solo <title>, senza immagine ne' descrizione.
//
// og:url deve coincidere col canonical, altrimenti i crawler social
// attribuiscono like e condivisioni a due URL diversi.
function socialMeta({ url, title, desc, lang, imgAlt, ogType }) {
  const meta = (attr, name, content) =>
    '<meta ' + attr + '="' + name + '" content="' + escapeHtml(content) + '">';
  const img = BASE_URL + OG_IMAGE;
  const out = [];

  out.push(meta('property', 'og:type', ogType));
  out.push(meta('property', 'og:site_name', 'AURA'));
  out.push(meta('property', 'og:title', title));
  out.push(meta('property', 'og:description', desc));
  out.push(meta('property', 'og:url', url));
  out.push(meta('property', 'og:locale', OG_LOCALES[lang]));
  for (const l of LANGS) {
    if (l !== lang) out.push(meta('property', 'og:locale:alternate', OG_LOCALES[l]));
  }
  out.push(meta('property', 'og:image', img));
  out.push(meta('property', 'og:image:type', OG_IMAGE_TYPE));
  out.push(meta('property', 'og:image:width', '1200'));
  out.push(meta('property', 'og:image:height', '630'));
  out.push(meta('property', 'og:image:alt', imgAlt));

  out.push(meta('name', 'twitter:card', 'summary_large_image'));
  out.push(meta('name', 'twitter:title', title));
  out.push(meta('name', 'twitter:description', desc));
  out.push(meta('name', 'twitter:image', img));
  // Per specifica twitter:image:alt NON ricade su og:image:alt: i client
  // che leggono solo il namespace twitter: restavano senza alternativa
  // testuale sull'immagine della card.
  out.push(meta('name', 'twitter:image:alt', imgAlt));

  return out.join('\n');
}

// ---------- SEO nel <head> ----------
// Tutto cio' che varia per lingua: canonical, hreflang reciproci,
// Open Graph, Twitter Card, JSON-LD.
function buildSeoHead(lang, t) {
  const url = pageUrl(lang);
  const out = [];

  out.push('<link rel="canonical" href="' + url + '">');

  // Blocco hreflang: ogni pagina elenca tutte le lingue, se stessa inclusa,
  // altrimenti la reciprocita' non e' completa e i motori lo ignorano.
  out.push(hreflangBlock(pageUrl));

  out.push(socialMeta({
    url,
    title: getPath(t, 'seo.title'),
    desc: getPath(t, 'seo.description'),
    lang,
    imgAlt: getPath(t, 'seo.ogImageAlt'),
    ogType: 'website'
  }));

  out.push(buildJsonLd(lang, t));
  return out.join('\n');
}

function buildJsonLd(lang, t) {
  const url = pageUrl(lang);
  const orgId = BASE_URL + '/#organization';
  const graph = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': orgId,
        name: 'AURA',
        legalName: 'AI LAB L.L.C-FZ',
        url: BASE_URL + '/',
        logo: BASE_URL + '/assets/logo.png',
        email: 'info@aurabeauty.app',
        // TRN emiratino, non una partita IVA UE: taxID, mai vatID. Il
        // prefisso "TRN" fa parte del valore: un numero nudo in un campo
        // fiscale si legge come partita IVA, e questo non lo e'.
        taxID: 'TRN 105142922100003',
        address: {
          '@type': 'PostalAddress',
          streetAddress: 'Meydan Grandstand, 6th floor, Meydan Road, Nad Al Sheba',
          addressLocality: 'Dubai',
          addressCountry: 'AE'
        }
        // sameAs rimosso: era un array vuoto, cioe' la dichiarazione di
        // non avere profili ufficiali. Va reintrodotto con gli URL veri
        // quando esistono.
      },
      {
        '@type': 'WebSite',
        '@id': url + '#website',
        url: url,
        name: 'AURA',
        inLanguage: lang,
        publisher: { '@id': orgId }
      },
      {
        '@type': 'SoftwareApplication',
        name: 'AURA',
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Web',
        description: getPath(t, 'seo.description'),
        url: url,
        offers: { '@type': 'Offer', availability: 'https://schema.org/InStock' }
      }
    ]
  };
  // "<" sempre escapato: una stringa contenente "</script>" chiuderebbe
  // il blocco in anticipo. < resta JSON valido.
  const json = JSON.stringify(graph, null, 2).replace(/</g, '\\u003c');
  return '<script type="application/ld+json">\n' + json + '\n</script>';
}

// ---------- file di supporto ----------

function buildRobotsTxt() {
  // Nessun blocco per i crawler AI: la visibilita' su quelli e' voluta.
  return [
    'User-agent: *',
    'Allow: /',
    '',
    'Sitemap: ' + BASE_URL + '/sitemap.xml',
    ''
  ].join('\n');
}

function buildSitemapXml() {
  // Le alternate di un URL devono elencare pagine equivalenti fra loro: le
  // home con le home, le privacy con le privacy. Stesso insieme omogeneo
  // dei blocchi hreflang nel <head>, stessa funzione urlFor a deciderlo.
  const alternates = urlFor => LANGS
    .map(l => '    <xhtml:link rel="alternate" hreflang="' + l + '" href="' + urlFor(l) + '"/>')
    .concat('    <xhtml:link rel="alternate" hreflang="x-default" href="' + urlFor(X_DEFAULT) + '"/>')
    .join('\n');

  const entries = (urlFor, priority) => LANGS.map(lang => [
    '  <url>',
    '    <loc>' + urlFor(lang) + '</loc>',
    '    <lastmod>' + BUILD_DATE + '</lastmod>',
    '    <priority>' + priority + '</priority>',
    alternates(urlFor),
    '  </url>'
  ].join('\n')).join('\n');

  // priority e' un peso RELATIVO interno alla sitemap: dice quali pagine
  // contano di piu' fra le nostre, non rispetto ad altri siti. Le
  // informative vanno indicizzate ma non sono la ragione per cui il sito
  // esiste, quindi stanno sotto le home.
  //
  // Esclusa di proposito: "/", che e' il fallback noindex.
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"',
    '        xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    entries(pageUrl, '1.0'),
    entries(privacyUrl, '0.3'),
    '</urlset>',
    ''
  ].join('\n');
}

function buildLlmsTxt() {
  const links = LANGS.map(l => '- [' + l.toUpperCase() + '](' + pageUrl(l) + ')').join('\n');
  return [
    '# AURA',
    '',
    '> AI marketing automation for the beauty and health industry.',
    '',
    'AURA is an artificial-intelligence ecosystem that helps beauty centers,',
    'med spas, pharmacies, medical practices and other beauty-industry',
    'businesses find new clients, manage leads and increase sales.',
    '',
    '## What it does',
    '',
    '- Builds complete advertising campaigns: strategy, copy, images and',
    '  cinematic-quality video ads tuned for the Meta advertising algorithm.',
    '- Answers new leads around the clock, qualifies them and guides them',
    '  toward booking an appointment.',
    '- Reactivates dormant clients already in the business database and',
    '  supports upselling to active ones.',
    '- Reports on campaign performance using data aggregated across the',
    '  whole network of centers it operates for.',
    '',
    '## Who it is for',
    '',
    'Beauty centers, med spas, aesthetic clinics, pharmacies and medical',
    'practices that want more booked appointments without hiring an',
    'in-house marketing team.',
    '',
    '## Operator',
    '',
    'AI LAB L.L.C-FZ — Meydan Grandstand, 6th floor, Meydan Road,',
    'Nad Al Sheba, Dubai, United Arab Emirates. TRN 105142922100003.',
    'Contact: info@aurabeauty.app',
    '',
    '## Pages',
    '',
    links,
    ''
  ].join('\n');
}

function buildHeaders(assets) {
  // Le regole si applicano in ordine: /* per prima con la cache corta,
  // le successive sovrascrivono solo Cache-Control con quella lunga.
  //
  // I due asset fingerprintati sono elencati con il nome esatto invece
  // che con /style.*.css: il wildcard in mezzo al path non e' fra le
  // forme documentate per Pages, e un match mancato sarebbe silenzioso
  // (nessun errore, solo cache lunga persa). I nomi si rigenerano a ogni
  // build insieme all'hash, quindi non c'e' nulla da allineare a mano.
  const csp = [
    "default-src 'self'",
    "img-src 'self' data:",
    "font-src 'self'",
    // L'hash autorizza il solo <style> dentro <noscript>: nessun altro
    // stile inline passa, quindi la direttiva resta chiusa.
    "style-src 'self' " + noscriptCspHash(),
    // 'unsafe-inline' serve per lo <script> con window.AURA_I18N.
    "script-src 'self' 'unsafe-inline' static.cloudflareinsights.com",
    // api.web3forms.com non serve piu': il browser parla solo con
    // /api/contact, che e' same-origin e ricade in 'self'.
    "connect-src 'self' static.cloudflareinsights.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'"
  ].join('; ');

  const permissions = [
    'accelerometer=()', 'camera=()', 'display-capture=()', 'geolocation=()',
    'gyroscope=()', 'magnetometer=()', 'microphone=()', 'payment=()', 'usb=()'
  ].join(', ');

  return [
    '/*',
    '  Strict-Transport-Security: max-age=31536000; includeSubDomains',
    '  X-Content-Type-Options: nosniff',
    '  Referrer-Policy: strict-origin-when-cross-origin',
    '  X-Frame-Options: DENY',
    '  Permissions-Policy: ' + permissions,
    '  Content-Security-Policy: ' + csp,
    '  Cache-Control: public, max-age=0, must-revalidate',
    '',
    '/assets/*',
    '  Cache-Control: public, max-age=31536000, immutable',
    '',
    ...assets.flatMap(a => [
      a.url,
      '  Cache-Control: public, max-age=31536000, immutable',
      ''
    ])
  ].join('\n');
}

// La 404 e' un file statico servito per qualunque percorso ignoto: non ha
// una lingua determinabile. Il <title> e il lang del documento sono quindi
// quelli di x-default, ma il messaggio compare in tutte e cinque le lingue.
//
// Un h1 con "404" porta il significato in modo neutro rispetto alla
// lingua: le cinque frasi sono conferma, non segnale primario, e per
// questo stanno uniformi e senza gerarchia fra loro. <ul> e non cinque
// <p>: sono elementi paralleli, ed e' quello che una lista dichiara.
//
// lang su ogni <li> non e' decorativo: senza, uno screen reader legge la
// frase tedesca con fonetica inglese.
//
// L'ordine e' quello di LANG_OPTIONS, lo stesso dei link qui sotto, cosi'
// i due blocchi si rispecchiano.
//
// I titoli tradotti delle altre quattro lingue restano in translations.js
// pur non essendo consumati: functions/index.js negozia gia'
// Accept-Language per "/", e una eventuale functions/404.js che facesse
// lo stesso diventerebbe una modifica di una riga.
function build404(styleUrl, translations) {
  const links = LANG_OPTIONS
    .map(([code, label]) => '    <a href="/' + code + '/">' + escapeHtml(label) + '</a>')
    .join('\n');
  const messages = LANG_OPTIONS
    .map(([code]) => '    <li lang="' + code + '">' +
      escapeHtml(getPath(translations[code], 'notFound.message')) + '</li>')
    .join('\n');
  return [
    '<!DOCTYPE html>',
    '<html lang="' + X_DEFAULT + '">',
    '<head>',
    '<meta charset="UTF-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
    '<meta name="robots" content="noindex">',
    '<title>' + escapeHtml(getPath(translations[X_DEFAULT], 'notFound.title')) + '</title>',
    '<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">',
    '<meta name="theme-color" content="#0a0a12">',
    '<link rel="stylesheet" href="' + styleUrl + '">',
    '</head>',
    '<body>',
    '<div class="bg-glow"></div>',
    '<main class="section container narrow center">',
    '  <h1>404</h1>',
    '  <ul class="error-messages">',
    messages,
    '  </ul>',
    '  <nav class="hero-actions hero-actions-center error-langs">',
    links,
    '  </nav>',
    '</main>',
    '</body>',
    '</html>',
    ''
  ].join('\n');
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
function validateKeys(templates, translations) {
  const keys = [...new Set([
    // segnaposto presenti nei template
    ...templates
      .flatMap(tpl => [...tpl.matchAll(PLACEHOLDER)].map(m => m[1]))
      .filter(k => !BUILTIN.has(k)),
    // chiavi consumate a runtime via window.AURA_I18N: non compaiono nel
    // template, ma se mancassero il form resterebbe muto senza avvisare
    ...RUNTIME_KEYS,
    // usate dal build per <title>, <meta name="description"> e Open Graph
    'seo.title', 'seo.description', 'seo.ogImageAlt',
    // <head> e corpo delle pagine legali: risolte dal build, non dal
    // template, quindi invisibili alla scansione dei segnaposto
    'privacy.seo.title', 'privacy.seo.description', 'privacy.sections',
    // Titolo della hero: da quando il template usa {{HERO_TITLE}} questi
    // tre non compaiono piu' come segnaposto, e senza elencarli qui una
    // chiave mancante finirebbe in pagina come "undefined".
    'hero.title_pre', 'hero.title_grad', 'hero.title_post',
    // 404.html: scritta dal build, non passa da nessun template. Il
    // messaggio serve in tutte e cinque le lingue perche' la pagina le
    // mostra tutte; il titolo solo in x-default, ma richiederlo dovunque
    // costa nulla e tiene la porta aperta a una 404 che negozi la lingua.
    'notFound.title', 'notFound.message'
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
      `${problems.length} chiave/i usata/e nei template ma non risolvibile/i`,
      problems.join('\n') +
      `\n\nControllate ${keys.length} chiavi × ${LANGS.length} lingue.`
    );
  }
  return keys;
}

// ---------- guardia (e): forma delle sezioni legali ----------
// validateKeys sa dire che privacy.sections esiste ed e' un array, non che
// gli elementi abbiano la forma attesa. Senza questo controllo una sezione
// malformata finirebbe in pagina come "undefined" invece di far fallire
// il build.
function validateLegalSections(translations) {
  const problems = [];
  for (const lang of LANGS) {
    const secs = getPath(translations[lang], 'privacy.sections');
    if (!Array.isArray(secs) || secs.length === 0) {
      problems.push(`[${lang}] privacy.sections assente o vuoto`);
      continue;
    }
    secs.forEach((sec, i) => {
      const at = `[${lang}] privacy.sections[${i}]`;
      if (typeof sec !== 'object' || sec === null || Array.isArray(sec)) {
        problems.push(`${at} non è un oggetto`);
        return;
      }
      if (typeof sec.heading !== 'string' || !sec.heading.trim()) {
        problems.push(`${at}.heading mancante o vuoto`);
      }
      if (!Array.isArray(sec.paragraphs) || sec.paragraphs.length === 0) {
        problems.push(`${at}.paragraphs assente o vuoto`);
        return;
      }
      sec.paragraphs.forEach((p, j) => {
        if (typeof p !== 'string' || !p.trim()) {
          problems.push(`${at}.paragraphs[${j}] non è una stringa non vuota`);
        }
      });
    });
  }
  // Stesso numero di sezioni in tutte le lingue: una lingua con una sezione
  // in meno non e' una sfumatura di traduzione, e' un'informativa incompleta.
  const counts = LANGS.map(l => (getPath(translations[l], 'privacy.sections') || []).length);
  if (new Set(counts).size > 1) {
    problems.push('numero di sezioni diverso fra lingue: ' +
      LANGS.map((l, i) => l + '=' + counts[i]).join(' '));
  }
  if (problems.length) {
    fail(problems.length + ' problema/i nella struttura di privacy.sections',
      problems.join('\n'));
  }
}

// ---------- rendering ----------
// Sostituzione dei segnaposto, comune ai due template. Un segnaposto di
// build usato in una pagina che non lo prevede (p.es. {{I18N_SCRIPT}} in
// legal.html) fa fallire il build invece di finire in output come
// "undefined": e' l'errore piu' facile da introdurre ora che i template
// sono due.
function fill(template, builtin, t) {
  return template.replace(PLACEHOLDER, (_, key) => {
    if (BUILTIN.has(key)) {
      if (!(key in builtin)) {
        fail('segnaposto di build non disponibile in questa pagina', '{{' + key + '}}');
      }
      return RAW.has(key) ? builtin[key] : escapeHtml(builtin[key]);
    }
    const v = getPath(t, key);
    if (Array.isArray(v)) {
      return v.map(item => '<li>' + escapeHtml(item) + '</li>').join('\n            ');
    }
    return escapeHtml(v);
  });
}

// Titolo della hero in tre pezzi: testo, porzione col gradiente, testo.
// L'ordine e' quello, ma title_post serve solo al tedesco, dove il verbo
// va in fondo ("Die kunstliche Intelligenz, die Marketing in ...
// verwandelt"). Nelle altre quattro lingue e' "", e un <span></span> vuoto
// finiva nel markup di ogni home: si emette solo cio' che ha testo.
function heroTitle(t) {
  const parts = [
    ['', getPath(t, 'hero.title_pre')],
    [' class="grad-text"', getPath(t, 'hero.title_grad')],
    ['', getPath(t, 'hero.title_post')]
  ];
  return parts
    .filter(([, text]) => text !== '')
    .map(([attr, text]) => '<span' + attr + '>' + escapeHtml(text) + '</span>')
    .join('');
}

function render(template, lang, translations, assets) {
  const t = translations[lang];
  const assetUrls = Object.fromEntries(assets.map(a => [a.urlKey, a.url]));
  // Scritto una volta e passato sia al <select> sia ai link del
  // fallback: se la forma degli URL cambia, cambiano insieme.
  const urlFor = code => '/' + code + '/';
  return fill(template, {
    ...assetUrls,
    LANG: lang,
    LANG_UPPER: lang.toUpperCase(),
    TITLE: getPath(t, 'seo.title'),
    DESCRIPTION: getPath(t, 'seo.description'),
    // URL, non percorso filesystem: sempre forward slash.
    PRIVACY_URL: '/' + lang + '/privacy/',
    LANG_OPTIONS: langOptions(lang, urlFor),
    LANG_LINKS: langLinks(lang, urlFor),
    I18N_SCRIPT: buildI18nScript(t),
    NOSCRIPT_STYLE: noscriptStyle(),
    SEO_HEAD: buildSeoHead(lang, t),
    HERO_TITLE: heroTitle(t)
  }, t);
}

// Pagina legale. Niente JSON-LD (vedi verifyNoJsonLd), niente
// {{I18N_SCRIPT}}: non c'e' form, quindi non servono stringhe a runtime.
function renderLegal(template, lang, translations, assets) {
  const t = translations[lang];
  const assetUrls = Object.fromEntries(assets.map(a => [a.urlKey, a.url]));
  // Sulle pagine legali si resta fra pagine legali: dalla privacy
  // italiana si va alla privacy tedesca, non alla home tedesca.
  const urlFor = code => '/' + code + '/privacy/';
  return fill(template, {
    ...assetUrls,
    LANG: lang,
    TITLE: getPath(t, 'privacy.seo.title'),
    DESCRIPTION: getPath(t, 'privacy.seo.description'),
    // Il footer linka la privacy della lingua corrente anche dalla privacy
    // stessa: il footer e' identico su tutte le pagine.
    PRIVACY_URL: '/' + lang + '/privacy/',
    CANONICAL: privacyUrl(lang),
    HREFLANG_BLOCK: hreflangBlock(privacyUrl),
    // og:type article e non website: e' un documento, non il sito.
    // og:image e og:image:alt sono gli stessi della home — l'immagine
    // descrive il brand, non la pagina, e una card social per
    // l'informativa non ha una grafica propria.
    SOCIAL_BLOCK: socialMeta({
      url: privacyUrl(lang),
      title: getPath(t, 'privacy.seo.title'),
      desc: getPath(t, 'privacy.seo.description'),
      lang,
      imgAlt: getPath(t, 'seo.ogImageAlt'),
      ogType: 'article'
    }),
    LANG_OPTIONS: langOptions(lang, urlFor),
    LANG_LINKS: langLinks(lang, urlFor),
    // Il <select> c'e' anche qui, quindi qui serve la regola che lo
    // nasconde senza JS. Le altre regole di NOSCRIPT_CSS riguardano il
    // form, che su queste pagine non esiste: inerti, non dannose, e un
    // unico CSS significa un unico hash nella CSP.
    NOSCRIPT_STYLE: noscriptStyle(),
    BODY: renderLegalBody(getPath(t, 'privacy.sections'))
  }, t);
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
  // Guardia (d): un riferimento senza hash reintrodotto nel template
  // vanificherebbe la cache lunga. style.<hash>.css non matcha style.css,
  // quindi questo pattern scatta solo sul nome nudo.
  const unhashed = html.match(/(?:href|src)="[^"]*(?:style\.css|script\.js)"/g);
  if (unhashed) {
    fail('riferimento non fingerprintato in ' + label,
      [...new Set(unhashed)].join('\n') +
      '\n\nUsare {{STYLE_URL}} e {{SCRIPT_URL}}: il build li risolve nei\n' +
      'nomi con hash del contenuto.');
  }
}

// ---------- guardia (c): JSON-LD ----------
// Validata sull'HTML renderizzato, non sull'oggetto prima di serializzarlo:
// JSON.parse(JSON.stringify(x)) non puo' fallire, quindi non sarebbe una
// guardia. Cosi' intercetta escape rotti e segnaposto finiti nel blocco.
function verifyJsonLd(html, label) {
  const blocks = html.match(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g);
  if (!blocks) fail('JSON-LD assente in ' + label);
  if (blocks.length > 1) {
    fail('più di un blocco JSON-LD in ' + label, blocks.length + ' trovati, atteso 1');
  }
  const body = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(blocks[0])[1];
  try {
    const parsed = JSON.parse(body);
    if (!Array.isArray(parsed['@graph']) || parsed['@graph'].length !== 3) {
      fail('JSON-LD con @graph inatteso in ' + label,
        'attesi 3 nodi, trovati ' + (parsed['@graph'] || []).length);
    }
  } catch (e) {
    fail('JSON-LD non parsabile in ' + label, e.message + '\n\n' + body.slice(0, 400));
  }
}

// Speculare a verifyJsonLd. Sulle pagine legali il JSON-LD non ci deve
// essere: marcare un'informativa come SoftwareApplication o WebSite
// sarebbe dato strutturato falso.
function verifyNoJsonLd(html, label) {
  const blocks = html.match(/<script type="application\/ld\+json">/g);
  if (blocks) {
    fail('JSON-LD presente in ' + label,
      blocks.length + ' blocco/hi trovato/i, atteso nessuno');
  }
}

// ---------- guardia (f): integrita' dei riferimenti interni ----------
// Il consenso nel form rimanda a {{PRIVACY_URL}}: se quella pagina non
// venisse emessa, la casella "accetto l'informativa" punterebbe a un 404
// e il consenso non sarebbe informato. Il controllo e' generalizzato a
// tutti i riferimenti interni perche' lo stesso errore vale per fogli di
// stile, font e immagini — e perche' le pagine scritte a mano dal build
// (404.html, il fallback di "/") non passano da verifyOutput e quindi
// sfuggono alle altre guardie.
//
// Gira sull'output finale, non sull'HTML in memoria: e' l'unico momento
// in cui si puo' dire se il file di destinazione esiste davvero.
function verifyInternalLinks() {
  const problems = [];
  let checked = 0;
  for (const file of walk(DIST)) {
    if (!file.endsWith('.html')) continue;
    const label = path.relative(DIST, file).split(path.sep).join('/');
    const html = fs.readFileSync(file, 'utf8');
    const refs = [...html.matchAll(/(?:href|src)="([^"]+)"/g)].map(m => m[1]);
    // srcset e imagesrcset: "/a.avif 768w, /b.avif 1280w". Ogni voce e'
    // URL + descrittore, l'URL e' il primo token. Senza questo la guardia
    // vedrebbe solo il src di fallback e un <source> che punta a un file
    // inesistente passerebbe: il browser scarterebbe quel candidato in
    // silenzio, o mostrerebbe l'immagine rotta solo su certi dispositivi.
    for (const m of html.matchAll(/(?:srcset|imagesrcset)="([^"]+)"/g)) {
      // Split su virgola: corretto finche' gli URL non sono data: con
      // virgole dentro. Qui sono tutti percorsi assoluti.
      for (const entry of m[1].split(',')) {
        const url = entry.trim().split(/\s+/)[0];
        if (url) refs.push(url);
      }
    }
    // og:image, og:url, twitter:image e canonical vivono in content=", non
    // in href/src. Senza questo la card social poteva puntare a un file
    // inesistente e il build non se ne accorgeva: e' esattamente il caso
    // in cui og-image.png e' stato sostituito da og-image.jpg. Si
    // raccolgono solo i valori che SONO riferimenti, non testo libero
    // come og:title o og:description.
    for (const m of html.matchAll(/<meta[^>]+content="([^"]+)"/g)) {
      const v = m[1];
      if (v.startsWith('/') || v.startsWith(BASE_URL)) refs.push(v);
    }

    for (let ref of new Set(refs)) {
      // Gli URL assoluti sul dominio di produzione sono comunque file di
      // dist/: normalizzandoli la guardia copre anche canonical, hreflang
      // e og:image, che per specifica non possono essere relativi.
      if (ref.startsWith(BASE_URL)) ref = ref.slice(BASE_URL.length) || '/';
      // Solo i riferimenti interni assoluti. mailto:, ancore di pagina e
      // URL esterni ("//host/…" incluso) non sono file di dist/.
      if (!ref.startsWith('/') || ref.startsWith('//')) continue;
      const clean = ref.split('#')[0].split('?')[0];
      if (!clean) continue;
      // Una directory URL ("/it/privacy/") e' servita dal suo index.html.
      const rel = clean.endsWith('/') ? clean + 'index.html' : clean;
      const target = path.join(DIST, ...rel.split('/').filter(Boolean));
      checked++;
      if (!fs.existsSync(target)) problems.push(label + '  ->  ' + ref);
    }
  }
  if (problems.length) {
    fail(problems.length + ' riferimento/i interno/i a file che non esistono in dist/',
      problems.join('\n'));
  }
  return checked;
}

// ---------- guardia (h): nessuno stile inline nel markup ----------
// La CSP dichiara style-src senza 'unsafe-inline'. Un hash autorizza un
// elemento <style>, ma per specifica NON copre gli attributi
// style="...": per quelli servirebbe 'unsafe-hashes'. Il browser li
// blocca, e l'elemento resta senza la regola che doveva applicargli.
//
// Non e' teoria: l'honeypot del form aveva style="display:none", la
// regola veniva bloccata, e in produzione compariva una seconda
// checkbox accanto a quella del consenso. Ha spedito cosi' per cinque
// commit, perche' la pagina si carica lo stesso, il build passa, e
// solo la console del browser lo dice.
//
// La cura non e' allargare la CSP: e' non scrivere stili nel markup.
function verifyNoInlineStyles() {
  const problems = [];
  for (const file of walk(DIST)) {
    if (!file.endsWith('.html')) continue;
    const label = path.relative(DIST, file).split(path.sep).join('/');
    // Via il contenuto degli <script>: JSON-LD e payload i18n sono dati,
    // non markup, e una sequenza "style=" li dentro non e' un attributo.
    const html = fs.readFileSync(file, 'utf8')
      .replace(/<script[\s\S]*?<\/script>/g, '');
    for (const m of html.matchAll(/<([a-zA-Z][\w-]*)[^>]*?\sstyle\s*=\s*"([^"]*)"/g)) {
      problems.push(`${label}  <${m[1]} style="${m[2]}">`);
    }
  }
  if (problems.length) {
    fail(problems.length + ' attributo/i style="..." nel markup, che la CSP blocca',
      problems.join('\n') +
      '\n\nSpostare la dichiarazione in una classe di style.css.\n' +
      "Non aggiungere 'unsafe-hashes' o 'unsafe-inline' alla CSP: sarebbe\n" +
      'indebolire la policy per un problema che si risolve nel markup.');
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
  const legal = fs.readFileSync(path.join(SRC, 'legal.html'), 'utf8');

  const keys = validateKeys([template, legal], translations);
  validateLegalSections(translations);

  // Idempotenza: dist/ viene sempre ricreato da zero.
  fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(DIST, { recursive: true });

  let copied = 0;
  for (const item of COPY) {
    const from = path.join(ROOT, item);
    if (!fs.existsSync(from)) fail('risorsa da copiare mancante', item);
    copied += copyRecursive(from, path.join(DIST, item));
  }

  // Asset con hash nel nome. Emessi prima delle pagine, perche' il
  // rendering ha bisogno dei loro URL.
  const assets = FINGERPRINTED.map(entry => {
    if (!fs.existsSync(path.join(ROOT, entry.src))) {
      fail('asset da fingerprintare mancante', entry.src);
    }
    return fingerprint(entry);
  });
  for (const a of assets) {
    fs.writeFileSync(path.join(DIST, a.out), a.buf);
    copied++;
  }

  for (const lang of LANGS) {
    const html = render(template, lang, translations, assets);
    verifyOutput(html, `dist/${lang}/index.html`);
    verifyJsonLd(html, `dist/${lang}/index.html`);
    fs.mkdirSync(path.join(DIST, lang), { recursive: true });
    fs.writeFileSync(path.join(DIST, lang, 'index.html'), html);

    const priv = renderLegal(legal, lang, translations, assets);
    verifyOutput(priv, `dist/${lang}/privacy/index.html`);
    verifyNoJsonLd(priv, `dist/${lang}/privacy/index.html`);
    fs.mkdirSync(path.join(DIST, lang, 'privacy'), { recursive: true });
    fs.writeFileSync(path.join(DIST, lang, 'privacy', 'index.html'), priv);
  }

  fs.writeFileSync(path.join(DIST, 'index.html'), buildRootFallback());
  fs.writeFileSync(path.join(DIST, 'robots.txt'), buildRobotsTxt());
  fs.writeFileSync(path.join(DIST, 'sitemap.xml'), buildSitemapXml());
  fs.writeFileSync(path.join(DIST, 'llms.txt'), buildLlmsTxt());
  fs.writeFileSync(path.join(DIST, '404.html'),
    build404(assets.find(a => a.urlKey === 'STYLE_URL').url, translations));
  fs.writeFileSync(path.join(DIST, '_headers'), buildHeaders(assets));

  // Le versioni senza hash non devono esistere in dist/.
  for (const entry of FINGERPRINTED) {
    if (fs.existsSync(path.join(DIST, entry.src))) {
      fail('versione non fingerprintata emessa in dist/', entry.src);
    }
  }

  // Nessun nome escluso deve essere finito in dist/.
  for (const f of walk(DIST)) {
    const rel = path.relative(DIST, f);
    for (const seg of rel.split(path.sep)) {
      if (EXCLUDE.has(seg)) fail('file escluso finito in dist/', rel);
    }
  }

  const links = verifyInternalLinks();
  verifyNoInlineStyles();

  const files = walk(DIST);
  const bytes = files.reduce((s, f) => s + fs.statSync(f).size, 0);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;

  console.log('build ok');
  console.log(`  ${LANGS.length} home     ${LANGS.map(l => '/' + l + '/').join(' ')}`);
  console.log(`  ${LANGS.length} privacy  ${LANGS.map(l => '/' + l + '/privacy/').join(' ')}`);
  console.log(`  ${keys.length} chiavi risolte per lingua`);
  console.log(`  ${copied} file copiati`);
  console.log(`  ${links} riferimenti interni verificati`);
  for (const a of assets) console.log(`  fingerprint  ${a.src}  ->  ${a.out}`);
  console.log(`  ${files.length} file totali in dist/  (${(bytes / 1024).toFixed(1)} KB)`);
  console.log(`  ${ms.toFixed(0)} ms`);
}

build();
