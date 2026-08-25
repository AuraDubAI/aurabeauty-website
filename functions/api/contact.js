// Proxy server-side per il form contatti.
//
// Perche' esiste: la access_key di Web3Forms non deve stare nell'HTML.
// Il browser parla solo con questa Function, che valida, aggiunge la
// chiave da env e inoltra. Al client torna sempre e solo { success }.
//
// Richiede la variabile d'ambiente WEB3FORMS_KEY nel progetto Pages.

const UPSTREAM = 'https://api.web3forms.com/submit';

const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX = 5;

// ATTENZIONE — questo rate limiting e' best-effort e nulla di piu'.
// La Map vive nel singolo isolate: su un edge distribuito gli isolate
// sono molti, effimeri e indipendenti, quindi il limite effettivo e'
// "RATE_MAX per isolate per IP", non un limite globale. Ferma i loop
// accidentali e gli script banali, non un attacco distribuito.
// Per una difesa reale servono le Rate Limiting Rules di Cloudflare
// oppure un contatore condiviso su KV/Durable Object.
const hits = new Map();

function rateLimitOk(ip) {
  const now = Date.now();

  // Potatura opportunistica: senza, la Map cresce finche' l'isolate vive.
  for (const [key, times] of hits) {
    const live = times.filter(t => now - t < RATE_WINDOW_MS);
    if (live.length) hits.set(key, live);
    else hits.delete(key);
  }

  const times = (hits.get(ip) || []).filter(t => now - t < RATE_WINDOW_MS);
  if (times.length >= RATE_MAX) return false;
  times.push(now);
  hits.set(ip, times);
  return true;
}

function clientIp(request) {
  return request.headers.get('CF-Connecting-IP')
    || request.headers.get('X-Forwarded-For')
    || 'unknown';
}

function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...extraHeaders
    }
  });
}

// Validazione volutamente permissiva sulla forma dell'indirizzo: la
// verifica vera e' che l'email arrivi a destinazione, non una regex.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function validate(data) {
  if (!data || typeof data !== 'object') return false;
  const str = v => (typeof v === 'string' ? v.trim() : '');

  if (!str(data.nome)) return false;
  if (!EMAIL.test(str(data.email))) return false;
  if (data.privacy !== 'on') return false;
  // honeypot: se e' popolato, e' un bot
  if (str(data.botcheck)) return false;

  return true;
}

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') {
    return json({ success: false }, 405, { Allow: 'POST' });
  }

  if (!rateLimitOk(clientIp(request))) {
    return json({ success: false }, 429);
  }

  const data = await request.json().catch(() => null);
  if (!validate(data)) {
    return json({ success: false }, 400);
  }

  if (!env.WEB3FORMS_KEY) {
    // Configurazione mancante: e' un errore nostro, non del client.
    console.error('WEB3FORMS_KEY non configurata');
    return json({ success: false }, 500);
  }

  // Si inoltrano solo i campi attesi: quello che arriva dal client non
  // deve poter iniettare parametri arbitrari nella richiesta upstream.
  const payload = {
    access_key: env.WEB3FORMS_KEY,
    subject: 'Nuova richiesta demo da info.aurabeauty.app',
    from_name: 'AURA Website',
    nome: String(data.nome).trim(),
    attivita: String(data.attivita || '').trim(),
    email: String(data.email).trim(),
    messaggio: String(data.messaggio || '').trim(),
    lingua: String(data.lingua || '').trim(),
    privacy: 'on'
  };

  try {
    const upstream = await fetch(UPSTREAM, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(payload)
    });
    const body = await upstream.json().catch(() => ({}));
    // La risposta upstream non esce mai da qui: al client solo l'esito.
    return json({ success: upstream.ok && body.success === true });
  } catch (err) {
    console.error('inoltro a Web3Forms fallito:', err && err.message);
    return json({ success: false }, 502);
  }
}
