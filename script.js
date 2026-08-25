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

    // reset the demo-only success message when switching language
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

  // Contact form (placeholder handling — no backend connected yet)
  var form = document.getElementById('contact-form');
  var note = document.getElementById('form-note');
  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var lang = document.documentElement.getAttribute('lang') || DEFAULT_LANG;
      note.textContent = getPath(translations[lang], 'contact.success') || '';
      form.reset();
    });
  }
});
