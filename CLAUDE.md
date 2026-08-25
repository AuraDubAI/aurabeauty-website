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
- Rappresentante nell'UE (art. 27 GDPR): PERLA BEAUTY SRL,
  Via Cappuccio 11, 20123 Milano, Italia. Designazione effettuata.
  Non ha una casella propria: l'unico recapito dell'informativa
  resta info@aurabeauty.app
- Nel JSON-LD usare taxID, non vatID. addressCountry: AE
- Il valore di taxID include il prefisso: "TRN 105142922100003".
  Un numero nudo in un campo fiscale si legge come partita IVA.

## Punti aperti e accoppiamenti da rispettare
Dettaglio in README.md, sezione "Punti aperti". Qui solo ciò che
farebbe sbagliare chi modifica il codice.

- Cambiare `--pink` NON basta: in `style.css` ci sono nove `rgba()`
  con lo stesso rosa scritto a mano (`226,19,118`). Non possono
  leggere il token, perché serve il canale alpha e `rgba()` non
  accetta una variabile esadecimale. Vanno aggiornati tutti e nove,
  altrimenti token e letterali divergono in silenzio.
  `grep -o '226,19,118' style.css | wc -l` deve dare 10: i nove
  valori più la citazione nel commento accanto al token. Conta le
  occorrenze e non le righe, così resta valido anche se due
  dichiarazioni finiscono sulla stessa riga.
- Gli asset in `assets/` NON sono fingerprintati e `_headers` dà a
  `/assets/*` `max-age=31536000, immutable`. Cambiare un file
  mantenendo lo stesso nome non raggiunge chi lo ha già in cache.
  Per la grafica definitiva serve un nome nuovo, o spostare quei
  file fra i `FINGERPRINTED`.
- `favicon.svg` e `apple-touch-icon.png` sono segnaposto. Nel primo
  il rosa è testo e sta allineato a `--pink`; nel secondo è nei
  pixel e resta col vecchio valore finché non si rigenera.
- `BUILD_DATE` in `build.js` è una costante e va aggiornata a mano
  a ogni cambio di contenuto sostanziale, o passata da CI con
  `SOURCE_DATE_EPOCH`. Mai `new Date()`: romperebbe l'idempotenza.
- Il contrasto di `.grad-text` nell'`<h1>` della hero non è
  calcolabile: sta sopra una foto con due overlay, non un colore
  piatto. Va misurato su render. Non dedurlo.
- `sameAs` è stato rimosso dal JSON-LD perché era un array vuoto.
  Va reintrodotto con gli URL veri quando esistono profili social.
- Il rate limiting di `functions/api/contact.js` è per-isolate, non
  globale. **Se passa a KV o Durable Objects va riscritto anche il
  capoverso dell'informativa sull'indirizzo IP**: oggi dichiara che
  l'IP non è conservato oltre la verifica, e con una `Map` in un
  isolate effimero è vero. Un contatore persistente lo rende falso.
  La modifica tecnica e quella legale vanno fatte insieme.
