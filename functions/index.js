// Cloudflare Pages Function per "/".
// Instrada verso /<lang>/ in base ad Accept-Language. Solo lingua:
// nessuna decisione basata su IP o paese.
//
// Se questa Function non risponde, Pages serve dist/index.html, che fa
// lo stesso redirect via JS verso /en/.

const LANGS = ['it', 'en', 'de', 'fr', 'es'];
const FALLBACK = 'en';

// Accept-Language: "de-AT,de;q=0.9,en;q=0.8" -> ['de','de','en']
// ordinati per q decrescente. Confronta solo il sottotag primario,
// cosi' de-AT e de-CH finiscono entrambi su /de/.
function pickLanguage(header) {
  if (!header) return FALLBACK;

  const ranked = header
    .split(',')
    .map(part => {
      const [tag, ...params] = part.trim().split(';');
      const qParam = params.find(p => p.trim().startsWith('q='));
      const q = qParam ? parseFloat(qParam.split('=')[1]) : 1;
      return { tag: tag.trim().toLowerCase(), q: Number.isFinite(q) ? q : 0 };
    })
    .filter(e => e.tag && e.q > 0)
    .sort((a, b) => b.q - a.q);

  for (const { tag } of ranked) {
    if (tag === '*') return FALLBACK;
    const primary = tag.split('-')[0];
    if (LANGS.includes(primary)) return primary;
  }
  return FALLBACK;
}

export async function onRequestGet({ request }) {
  const lang = pickLanguage(request.headers.get('Accept-Language'));
  return new Response(null, {
    status: 302,
    headers: {
      'Location': '/' + lang + '/',
      // La risposta dipende dall'header: senza Vary una cache
      // intermedia servirebbe a tutti la lingua del primo visitatore.
      'Vary': 'Accept-Language',
      'Cache-Control': 'no-store'
    }
  });
}
