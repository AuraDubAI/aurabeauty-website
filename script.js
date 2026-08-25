document.addEventListener('DOMContentLoaded', function () {

  // Le stringhe che servono a runtime, iniettate dal build per la sola
  // lingua di questa pagina. I percorsi rispecchiano translations.js.
  var i18n = window.AURA_I18N || {};
  var msg = i18n.contact || {};
  var err = (i18n.form && i18n.form.err) || {};

  // Mobile nav toggle
  var toggle = document.getElementById('nav-toggle');
  var nav = document.getElementById('main-nav');
  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      var isOpen = nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });
    nav.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () {
        nav.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

  // Selettore lingua: naviga alla pagina corrispondente.
  // I value sono URL ("/it/", "/en/", ...) generati dal build.
  var langSelect = document.getElementById('lang-select');
  if (langSelect) {
    langSelect.addEventListener('change', function (e) {
      location.assign(e.target.value);
    });
  }

  // Footer year
  var yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // ---------- Form contatti ----------

  var form = document.getElementById('contact-form');
  var note = document.getElementById('form-note');
  var successBox = document.getElementById('form-success');
  var submitBtn = document.getElementById('submit-btn');
  var retryBtn = document.getElementById('retry-btn');
  if (!form || !note || !submitBtn) return;

  var btnLabel = submitBtn.querySelector('.btn-label');
  var submitText = btnLabel ? btnLabel.textContent : '';

  var NAME_MIN = 2;
  // ATTENZIONE: questo limite e' scritto anche nei testi
  // form.err.messageTooLong delle cinque lingue. Se cambia qui, vanno
  // cambiati anche quelli, altrimenti il messaggio mente.
  var MESSAGE_MAX = 2000;

  // Permissiva di proposito: accetta apostrofi, "+", sottodomini e TLD
  // lunghi. Una regex severa rifiuta indirizzi legittimi, e la verifica
  // che conta e' se la mail arriva a destinazione, non la sua forma.
  var EMAIL = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;

  var FIELDS = [
    {
      name: 'nome',
      errorId: 'err-nome',
      validate: function (el) {
        var v = el.value.trim();
        if (!v) return err.nameRequired;
        if (v.length < NAME_MIN) return err.nameTooShort;
        return null;
      }
    },
    {
      name: 'email',
      errorId: 'err-email',
      validate: function (el) {
        var v = el.value.trim();
        if (!v) return err.emailRequired;
        if (!EMAIL.test(v)) return err.emailInvalid;
        return null;
      }
    },
    {
      name: 'messaggio',
      errorId: 'err-messaggio',
      // Lunghezza sul valore grezzo, non su quello ripulito: e' il valore
      // grezzo che finisce nella richiesta.
      validate: function (el) {
        if (el.value.length > MESSAGE_MAX) return err.messageTooLong;
        return null;
      }
    },
    {
      name: 'privacy',
      errorId: 'err-privacy',
      validate: function (el) {
        return el.checked ? null : err.privacyRequired;
      }
    }
  ];

  // Un campo diventa "sporco" la prima volta che mostra un errore, e lo
  // resta. Da quel momento si rivaluta a ogni battuta, cosi' l'errore
  // sparisce appena corretto — e ricompare subito se il campo torna
  // invalido, perche' a quel punto la regola l'utente la conosce.
  var dirty = {};
  var sending = false;

  FIELDS.forEach(function (f) {
    f.el = form.elements[f.name];
    f.box = document.getElementById(f.errorId);
    if (!f.el || !f.box) return;

    // Non si valida mentre l'utente scrive per la prima volta: dire
    // "indirizzo non valido" dopo un carattere e' ostile. Si valida
    // quando lascia il campo.
    f.el.addEventListener('blur', function () { check(f); });

    f.el.addEventListener(f.el.type === 'checkbox' ? 'change' : 'input', function () {
      if (dirty[f.name]) check(f);
    });
  });

  // Sulla checkbox la classe va al contenitore: un bordo su 16px di lato
  // non si vede. Sugli altri campi va all'input.
  function marker(f) {
    if (f.name !== 'privacy') return f.el;
    return document.getElementById('consent-box') || f.el;
  }

  function check(f) {
    if (!f.el || !f.box) return true;
    var message = f.validate(f.el);
    if (message) {
      dirty[f.name] = true;
      f.box.textContent = message;
      f.el.setAttribute('aria-invalid', 'true');
      f.el.setAttribute('aria-describedby', f.box.id);
      marker(f).classList.add('is-invalid');
      return false;
    }
    f.box.textContent = '';
    f.el.removeAttribute('aria-invalid');
    f.el.removeAttribute('aria-describedby');
    marker(f).classList.remove('is-invalid');
    return true;
  }

  function setNote(text, isError) {
    note.textContent = text || '';
    note.classList.toggle('is-error', !!(isError && text));
  }

  // Le opzioni di scrollIntoView vincono sul CSS scroll-behavior, quindi
  // prefers-reduced-motion va letto qui, non solo nel foglio di stile.
  function smoothOk() {
    return !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function focusFirst(f) {
    var el = f.el;
    var r = el.getBoundingClientRect();
    var vh = window.innerHeight || document.documentElement.clientHeight;
    // Solo se e' fuori dal viewport: portare in vista un campo che si
    // vede gia' produce uno scatto senza motivo.
    if (r.top < 0 || r.bottom > vh) {
      el.scrollIntoView({ block: 'center', behavior: smoothOk() ? 'smooth' : 'auto' });
    }
    // preventScroll: il focus non deve strappare la pagina mentre lo
    // scroll morbido e' ancora in corso.
    try { el.focus({ preventScroll: true }); } catch (e) { el.focus(); }
  }

  function validateAll() {
    // map prima di filter: check() va eseguito su OGNI campo, altrimenti
    // i campi dopo il primo invalido non verrebbero marcati.
    return FIELDS.map(function (f) {
      return { f: f, ok: check(f) };
    }).filter(function (r) {
      return !r.ok;
    }).map(function (r) {
      return r.f;
    });
  }

  function trySend() {
    if (sending) return;
    var invalid = validateAll();
    if (invalid.length) {
      // Il riepilogo passa da #form-note, che resta sempre nel DOM ed e'
      // quindi una live region affidabile: i singoli .field-error sono in
      // display:none quando vuoti, e l'annuncio di un role="alert" che
      // rientra nell'albero non e' garantito su tutti i browser.
      setNote(err.summary, true);
      focusFirst(invalid[0]);
      return;
    }
    send();
  }

  function startSending() {
    sending = true;
    setNote('', false);
    if (retryBtn) retryBtn.hidden = true;
    submitBtn.disabled = true;
    submitBtn.classList.add('is-sending');
    if (btnLabel) btnLabel.textContent = msg.sending || '';
    form.setAttribute('aria-busy', 'true');
  }

  function stopSending() {
    sending = false;
    submitBtn.disabled = false;
    submitBtn.classList.remove('is-sending');
    if (btnLabel) btnLabel.textContent = submitText;
    form.removeAttribute('aria-busy');
  }

  function onSuccess() {
    // Il form si nasconde, non si svuota: l'utente ha finito, e un form
    // vuoto lo inviterebbe a ricompilare.
    form.hidden = true;
    if (successBox) {
      successBox.hidden = false;
      successBox.focus();
    } else {
      setNote(msg.success || '', false);
    }
  }

  function onFailure() {
    // I campi restano compilati: l'errore e' della rete, non dell'utente.
    setNote(msg.error || '', true);
    if (retryBtn) retryBtn.hidden = false;
  }

  async function send() {
    startSending();
    try {
      var response = await fetch('/api/contact', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(Object.fromEntries(new FormData(form)))
      });
      var json = await response.json();

      if (response.ok && json.success) {
        stopSending();
        onSuccess();
        return;
      }
      onFailure();
    } catch (e) {
      // rete caduta, o una risposta che non e' JSON
      onFailure();
    }
    stopSending();
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    trySend();
  });

  if (retryBtn) {
    retryBtn.addEventListener('click', function () {
      // Rivalida prima di rilanciare: fra il primo tentativo e il
      // secondo l'utente puo' avere toccato i campi.
      retryBtn.hidden = true;
      trySend();
    });
  }
});
