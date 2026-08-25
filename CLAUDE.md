# Progetto AURA — sito marketing

Landing page singola, multilingua, statica. Nessun framework, nessuna
dipendenza npm runtime. Vanilla HTML/CSS/JS.

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

## Contatti
- Email lead: info@aurabeauty.app
- Nessun telefono, nessun WhatsApp.
- Dati legali: usare i segnaposto __RAGIONE_SOCIALE__, __PIVA__,
  __SEDE_LEGALE__ finché non forniti.
