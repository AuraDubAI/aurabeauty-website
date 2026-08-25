# AURA — sito marketing

Landing page multilingua, statica. Nessun framework, nessuna dipendenza npm a
runtime, nessun passo di build oltre a Node. Vanilla HTML/CSS/JS.

Produzione: <https://info.aurabeauty.app>
Lingue: `it`, `en`, `de`, `fr`, `es`. `x-default` = `en`.

## Struttura

```
build.js                 generatore statico — solo moduli core di Node
serve.js                 server locale di anteprima
style.css                foglio di stile unico
script.js                JS di pagina (nav, selettore lingua, invio form)

src/template.html        template della home
src/legal.html           template delle pagine informative
src/translations.js      TUTTI i testi delle 5 lingue

assets/                  immagini, font, favicon — copiati verbatim
functions/index.js       Pages Function: "/" → /<lang>/ da Accept-Language
functions/api/contact.js Pages Function: proxy del form verso Web3Forms

dist/                    output del build, rigenerato da zero — non versionato
```

Cosa produce il build in `dist/`:

```
dist/<lang>/index.html          5 home
dist/<lang>/privacy/index.html  5 informative privacy
dist/index.html                 fallback di "/" (noindex, redirect JS a /en/)
dist/404.html                   pagina 404
dist/style.<hash>.css           foglio di stile con hash del contenuto
dist/script.<hash>.js           JS con hash del contenuto
dist/assets/**                  copia di assets/
dist/sitemap.xml                10 URL: home a priority 1.0, privacy a 0.3
dist/robots.txt
dist/llms.txt
dist/_headers                   security headers + CSP + cache
```

`index.html` in root **non esiste**: le pagine vivono in `dist/<lang>/`.

## Build

```sh
node build.js        # rigenera dist/ da zero
node serve.js        # anteprima locale
npm run dev          # build + serve
```

Il build è **idempotente**: a parità di sorgenti l'output è identico byte per
byte. Niente timestamp, ID casuali o ordinamenti non deterministici. La data
di `<lastmod>` nella sitemap è la costante `BUILD_DATE` in `build.js`, non
`new Date()`; da CI si può passare `SOURCE_DATE_EPOCH`.

Verificare l'idempotenza:

```sh
node build.js && find dist -type f | sort | xargs sha256sum | sha256sum
node build.js && find dist -type f | sort | xargs sha256sum | sha256sum
# i due hash devono coincidere
```

### Le guardie

Il build **fallisce** invece di pubblicare qualcosa di rotto. Se una guardia
scatta si corregge la causa, non la guardia.

| | cosa impedisce |
|---|---|
| (a) `validateKeys` | una chiave usata nei template e mancante in una lingua |
| (b) `verifyOutput` | segnaposto `{{…}}` non risolti, `data-i18n` residui, backslash negli URL |
| (c) `verifyJsonLd` / `verifyNoJsonLd` | JSON-LD assente o non parsabile sulle home; JSON-LD **presente** sulle pagine legali |
| (d) riferimenti non fingerprintati | `style.css`/`script.js` senza hash finiti in un `href` |
| (e) `validateLegalSections` | `privacy.sections` malformato, o un numero di sezioni diverso fra lingue |
| (f) `verifyInternalLinks` | un `href`/`src` interno che punta a un file inesistente in `dist/` |

La (f) è quella che tiene onesto il link del consenso nel form: se
`/<lang>/privacy/` non venisse emessa, il build si ferma invece di pubblicare
una casella di consenso che rimanda a un 404.

## Dove vivono i testi

**Tutti** i testi stanno in `src/translations.js`, una voce per lingua. Nei
template compaiono solo come segnaposto `{{chiave.sottochiave}}`. Non
hardcodare copy nei template: la guardia (a) non se ne accorgerebbe (il testo
c'è) ma la traduzione sparirebbe per le altre quattro lingue.

`src/translations.js` **non finisce mai in `dist/`**: sono ~96 KB di cinque
lingue per usarne una. Il build inietta inline solo le tre stringhe che
servono a runtime (gli esiti dell'invio del form) per la lingua della pagina.

Le informative privacy sono strutturate come dati, non come markup:

```js
privacy: {
  seo: { title: "…", description: "…" },
  title: "…",          // <h1>
  intro: "…",          // occhiello
  sections: [
    { heading: "…", paragraphs: ["…", "…"] }
  ]
}
```

Il build rende `sections` in `<h2>` + `<p>`, escapando ogni stringa. **Non
mettere HTML in `translations.js`**: verrebbe mostrato come testo.

Aggiungere una sezione all'informativa significa aggiungerla in tutte e cinque
le lingue: la guardia (e) rifiuta conteggi disallineati.

## Deploy — Cloudflare Pages

| impostazione | valore |
|---|---|
| Build command | `node build.js` |
| Build output directory | `dist` |
| Root directory | `/` |
| Node version | ≥ 18 |

Variabili d'ambiente del progetto Pages:

| nome | a cosa serve |
|---|---|
| `WEB3FORMS_KEY` | access key di Web3Forms, usata da `functions/api/contact.js` |

La `access_key` **non deve stare nell'HTML**. Il browser parla solo con
`/api/contact`, che è same-origin; la Function aggiunge la chiave da env e
inoltra a Web3Forms. Al client torna solo `{ success }`.

`functions/` non viene copiata in `dist/`: Pages la legge dalla root del
repository. La CSP in `_headers` non elenca `api.web3forms.com` proprio perché
il browser non lo contatta mai.

## Punti aperti

- [ ] **Validazione legale dell'informativa** — due punti in particolare:
      la base del trasferimento extra-UE (art. 49.1.a, consenso esplicito,
      scelto perché il titolare *è* fuori dall'UE e non esiste un esportatore
      UE che possa firmare clausole contrattuali tipo) e il termine di
      conservazione di 24 mesi. Entrambe sono scelte, non dati di fatto.
- [ ] **`sameAs: []`** in `buildJsonLd` (`build.js`) — array vuoto. Va
      popolato con i profili social ufficiali quando esistono, o rimosso.
- [ ] **`BUILD_DATE`** in `build.js` — costante `'2026-08-25'`, usata per
      `<lastmod>` nella sitemap. Va aggiornata a mano quando i contenuti
      cambiano in modo sostanziale, oppure passata da CI con
      `SOURCE_DATE_EPOCH`. Non usare `new Date()`: romperebbe l'idempotenza.
- [x] **`assets/og-image.jpg`** (1200×630) — non è più un segnaposto: è
      generato da `tools/gen-og-image.mjs` ritagliando `assets/hero-bg.jpg`
      con la strategia `attention` e applicando lo stesso scurimento della
      hero a intensità ridotta. Il logo **non** viene composto sopra:
      `hero-bg.jpg` ha già il marchio impresso nei pixel, e `assets/logo.png`
      è lo stesso wordmark. I dettagli sono nell'intestazione dello script.
- [ ] **Segnaposto grafici** — `assets/hero-bg.jpg`, `assets/founder.jpg`,
      `assets/logo.png`, `assets/apple-touch-icon.png` e `assets/favicon.svg`
      sono provvisori, in attesa della grafica definitiva.
      Nota su `favicon.svg`: il rosa del gradiente è stato allineato a mano
      a `--pink` (`#e21376`). È testo nel file, quindi si modifica come i
      letterali del CSS. `apple-touch-icon.png` no: lì il rosa è nei pixel
      e va rigenerato, e per ora resta col vecchio valore.
      Attenzione al caching: `_headers` dà a `/assets/*`
      `max-age=31536000, immutable` e questi file **non** sono
      fingerprintati, quindi cambiarli mantenendo lo stesso nome non
      raggiunge i client che li hanno già in cache. Per gli asset
      definitivi serve un nome nuovo, o spostarli fra i `FINGERPRINTED`.
- [ ] **I nove `rgba()` letterali col rosa del brand** in `style.css` —
      bagliori, `box-shadow`, bordi `:hover` e gradienti di fondo usano
      `rgba(226,19,118, …)`, cioè `--pink` scritto a mano. **Non possono
      leggere il token**: serve il canale alpha, e `rgba()` non accetta una
      variabile esadecimale. Se `--pink` cambia, vanno aggiornati a mano
      tutti e nove, altrimenti token e letterali divergono in silenzio. La
      ragione è commentata accanto al token in `style.css`.
      `grep -o '226,19,118' style.css | wc -l` deve dare 10: i nove valori
      più la citazione dentro quel commento. Conta le occorrenze e non le
      righe, così resta valido anche se due dichiarazioni finiscono sulla
      stessa riga.
- [ ] **Contrasto di `.grad-text` nell'`<h1>` della hero** — va misurato su
      render, non calcolato. Quel testo usa `background-clip: text` sopra
      `hero-bg.jpg` a `opacity: 0.5` più due overlay (`rgba(10,10,18,.55)`
      verticale e `rgba(10,10,18,.9)` orizzontale): il fondo effettivo
      dipende dai pixel della foto, non da un colore piatto, quindi nessuna
      formula lo decide. Gli altri usi del gradiente come testo sono su
      fondi piatti e sono verificati: `.diff-stat-num` sta a 4,16:1 su
      `--bg-alt`, oltre i 3:1 richiesti al testo grande.
- [ ] **Varianti responsive delle immagini** — in `assets/` esistono già le
      versioni AVIF/WebP/JPEG a 1920/1280/768 px generate con
      `tools/gen-images.mjs`, ma **nessun template le usa ancora**: il markup
      `<picture>` non è stato scritto. Finché non lo è, quei file occupano
      spazio in `dist/` senza essere serviti.
- [ ] **Rate limiting del form** — quello in `functions/api/contact.js` è
      best-effort: la `Map` vive nel singolo isolate, quindi il limite reale è
      «5 per isolate per IP», non globale. Per una difesa vera servono le Rate
      Limiting Rules di Cloudflare o un contatore su KV / Durable Object.
      **Se si passa a KV o Durable Objects va rivisto anche il capoverso
      dell'informativa sull'indirizzo IP.** Oggi dice che «per questa
      verifica l'indirizzo IP non viene conservato oltre il tempo necessario
      a effettuarla», e con una `Map` in memoria dentro un isolate effimero
      è vero. Un contatore persistente lo renderebbe falso: l'IP diventerebbe
      un dato scritto in uno storage con una sua durata, da dichiarare come
      tale nelle sezioni «Per quanto tempo conserviamo i dati» e «A chi
      comunichiamo i dati». È una modifica tecnica che cambia un'affermazione
      legale, quindi le due cose vanno fatte insieme.

## Vincoli da non violare

- Nessuna dipendenza npm. `build.js` usa solo moduli core di Node.
  (`tools/gen-images.mjs` è un'eccezione fuori dal build: richiede `sharp`
  installato con `npm install --no-save sharp`, si esegue a mano quando
  servono nuove varianti d'immagine, e non entra né in `package.json` né in
  `dist/`.)
- Design, layout, copy e palette sono approvati: non si cambiano.
- Niente sezioni o pagine oltre a quelle richieste.
- `style.css` e `script.js` sono emessi con hash del contenuto nel nome e
  referenziati con URL **assoluti**. Un riferimento relativo da `/it/`
  cercherebbe `/it/style.<hash>.css` e darebbe 404.
- Il TRN emiratino va sempre etichettato «TRN», mai «P.IVA» o «VAT UE». Nel
  JSON-LD si usa `taxID`, non `vatID`; `addressCountry` è `AE`.
