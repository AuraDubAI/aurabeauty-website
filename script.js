document.addEventListener('DOMContentLoaded', function () {

  var DEFAULT_LANG = 'en';

  function getPath(obj, path) {
    return path.split('.').reduce(function (o, k) { return (o && o[k] !== undefined) ? o[k] : undefined; }, obj);
  }

  function applyLanguage(lang) {
    if (!translations[lang]) lang = DEFAULT_LANG;
    document.documentElement.setAttribute('lang', lang);

    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      var val = getPath(translations[lang], el.getAttribute('data-i18n'));
      if (typeof val === 'string') el.textContent = val;
    });

    document.querySelectorAll('[data-i18n-placeholder]').forEach(function (el) {
      var val = getPath(translations[lang], el.getAttribute('data-i18n-placeholder'));
      if (typeof val === 'string') el.placeholder = val;
    });

    document.querySelectorAll('[data-i18n-aria-label]').forEach(function (el) {
      var val = getPath(translations[lang], el.getAttribute('data-i18n-aria-label'));
      if (typeof val === 'string') el.setAttribute('aria-label', val);
    });

    document.querySelectorAll('[data-i18n-list]').forEach(function (el) {
      var arr = getPath(translations[lang], el.getAttribute('data-i18n-list'));
      if (Array.isArray(arr)) {
        el.innerHTML = '';
        arr.forEach(function (item) {
          var li = document.createElement('li');
          li.textContent = item;
          el.appendChild(li);
        });
      }
    });

    document.querySelectorAll('.lang-select').forEach(function (sel) {
      sel.value = lang;
    });

    // clear any submit feedback when switching language
    var note = document.getElementById('form-note');
    if (note) note.textContent = '';
  }

  // Language selector(s)
  document.querySelectorAll('.lang-select').forEach(function (sel) {
    sel.addEventListener('change', function (e) {
      applyLanguage(e.target.value);
    });
  });

  applyLanguage(DEFAULT_LANG);

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

      var lang = document.documentElement.getAttribute('lang') || DEFAULT_LANG;
      var t = function (key) { return getPath(translations[lang], key) || ''; };
      var originalText = submitBtn.textContent;

      submitBtn.disabled = true;
      submitBtn.textContent = t('contact.sending');
      form.setAttribute('aria-busy', 'true');
      note.textContent = '';

      try {
        var response = await fetch('https://api.web3forms.com/submit', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify(Object.fromEntries(new FormData(form)))
        });
        var json = await response.json();

        if (response.ok && json.success) {
          note.textContent = t('contact.success');
          form.reset();
        } else {
          note.textContent = t('contact.error');
        }
      } catch (err) {
        // network failure, or a response body that isn't JSON
        note.textContent = t('contact.error');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
        form.removeAttribute('aria-busy');
      }
    });
  }
});
