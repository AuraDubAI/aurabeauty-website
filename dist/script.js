document.addEventListener('DOMContentLoaded', function () {

  // Le uniche stringhe che servono a runtime, iniettate dal build
  // per la sola lingua di questa pagina.
  var i18n = window.AURA_I18N || {};

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

  // Contact form → Web3Forms
  var form = document.getElementById('contact-form');
  var note = document.getElementById('form-note');
  if (form && note) {
    var submitBtn = form.querySelector('button[type="submit"]');

    form.addEventListener('submit', async function (e) {
      e.preventDefault();

      var originalText = submitBtn.textContent;

      submitBtn.disabled = true;
      submitBtn.textContent = i18n.sending || '';
      form.setAttribute('aria-busy', 'true');
      note.textContent = '';

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
          note.textContent = i18n.success || '';
          form.reset();
        } else {
          note.textContent = i18n.error || '';
        }
      } catch (err) {
        // network failure, or a response body that isn't JSON
        note.textContent = i18n.error || '';
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
        form.removeAttribute('aria-busy');
      }
    });
  }
});
