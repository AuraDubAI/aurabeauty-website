# Progetto AURA — sito marketing

Landing page singola, multilingua, statica. Nessun framework, nessuna
dipendenza npm runtime. Vanilla HTML/CSS/JS.

## Sorgenti e build
- `src/template.html` — unico template, testi come segnaposto `{{chiave}}`
- `src/translations.js` — tutti i testi delle 5 lingue
- `style.css`, `script.js` — in root, copiati in `dist/` invariati
- `build.js` — in root, solo moduli core di Node
- Build: `node build.js` — rigenera `dist/` da zero a ogni esecuzione
- **`index.html` in root non esiste più.** Le pagine sono generate in
  `dist/<lang>/index.html`, più un fallback `dist/index.html` noindex.

## Deploy
- Host: Cloudflare Pages, build `node build.js`, output `dist/`
- URL produzione: https://info.aurabeauty.app
- Lingue: it, en, de, fr, es. x-default = en
- Struttura URL: /it/, /en/, /de/, /fr/, /es/

## Regole vincolanti
- NON cambiare design, layout, copy o palette. Il progetto è approvato.
- NON aggiungere dipendenze npm. build.js usa solo moduli core di Node.
- NON aggiungere sezioni o pagine oltre a quelle richieste esplicitamente.
- I testi vivono SOLO in src/translations.js. Mai hardcodare copy
  nel template.
- Ogni modifica: mostra il diff e attendi conferma prima di applicare.
- Dopo ogni blocco di lavoro, esegui `node build.js` e verifica che
  dist/ si generi senza errori.
- Il build deve restare idempotente: a parità di sorgenti l'hash di
  `dist/` non cambia. Niente timestamp, ID casuali o ordinamenti
  non deterministici nell'output.
- Le due guardie di build — chiave mancante in una lingua, segnaposto
  non risolto nell'output — non vanno mai indebolite né aggirate.
  Se il build fallisce si corregge la causa, non la guardia.
- `src/translations.js` non deve MAI finire in `dist/`: è un sorgente
  di build, non un asset di produzione (~45 KB di 5 lingue per usarne una).
- `style.css` e `script.js` sono emessi in `dist/` con hash del contenuto
  nel nome. I riferimenti nel template sono riscritti dal build e devono
  essere assoluti. Non reintrodurre riferimenti non fingerprintati.

## Contatti
- Email lead: info@aurabeauty.app
- Nessun telefono, nessun WhatsApp.

## Dati legali
- Titolare: AI LAB L.L.C-FZ
- Sede: Meydan Grandstand, 6th floor, Meydan Road, Nad Al Sheba,
  Dubai, U.A.E.
- Identificativo fiscale: TRN 105142922100003 (NON è una P.IVA UE,
  va sempre etichettato "TRN")
- Nel JSON-LD usare taxID, non vatID. addressCountry: AE
