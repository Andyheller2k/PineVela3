/* One consent-aware Google tag for the app and standalone policy documents.
 * This file never reads account data, field values, messages or document titles.
 * Keep Enhanced measurement OFF in the web stream: page views are sent here. */
(function () {
  'use strict';
  if (window.PineVelaAnalytics) return;
  var ID = 'G-NWBP5E04F9', KEY = 'pinevela:analytics-consent', DISABLE = 'ga-disable-' + ID;
  var choice = null, initialized = false, failed = false, lastKey = '', previousPage = '', panel = null, returnFocus = null, dismissed = false;
  var production = location.protocol === 'https:' && /^(?:www\.)?pinevela\.app$/.test(location.hostname) && !location.port;
  var pages = {
    '/': ['Home', true], '/pinemarket': ['Marketplace', true], '/pineresidence': ['Residences', true],
    '/why-us': ['Why PineVela', true], '/faq': ['Frequently asked questions', true], '/help': ['Help', true],
    '/user/dashboard': ['Account dashboard'], '/student/dashboard': ['Resident dashboard'], '/resident/dashboard': ['Resident dashboard'],
    '/manager/dashboard': ['Manager dashboard'], '/staff/dashboard': ['Staff dashboard'], '/admin/dashboard': ['Administrator dashboard'],
    '/digital-market': ['Seller dashboard'], '/market': ['Marketplace'], '/customer-service': ['Customer service'],
    '/field-officer': ['Field officer dashboard'], '/officer/dashboard': ['Field officer dashboard'],
    '/verification-team': ['Verification dashboard'], '/verification-portal': ['Verification dashboard']
  };
  function readChoice() {
    try {
      var saved = JSON.parse(localStorage.getItem(KEY));
      return saved && saved.version === 1 && ['granted', 'denied'].indexOf(saved.analytics) !== -1 ? saved.analytics : null;
    } catch (_) { return null; }
  }
  function privacySignal() { return navigator.globalPrivacyControl === true; }
  function describePage() {
    try {
      var hash = location.hash.slice(1), app = location.pathname === '/' || location.pathname === '/index.html';
      var route = app ? (hash.split('?')[0] || '/') : location.pathname;
      if (app && route.charAt(0) !== '/') return null;
      route = route.replace(/\/+$/, '') || '/';
      var query = new URLSearchParams(location.search + (app && hash.indexOf('?') !== -1 ? '&' + hash.slice(hash.indexOf('?') + 1) : ''));
      for (var pair of query) if (/token|code|email|password|secret|room.?key|(?:^|_)pin|reference|payment|auth|state/i.test(pair[0])) return null;
      var item = pages[route], safePath = route;
      if (!app && route === '/privacy.html') item = ['Privacy policy', true];
      if (!app && (route === '/terms.html' || /^\/legal\/terms-\d{4}-\d{2}-\d{2}\.html$/.test(route))) { item = ['Terms of service', true]; safePath = '/terms.html'; }
      if (app && /^\/pinemarket\/stores\/[a-zA-Z0-9_-]+$/.test(route)) { item = ['Marketplace store', true]; safePath = '/pinemarket/stores/store'; }
      if (!item) return null;
      // The raw route is used only for in-memory deduplication. Only safePath is sent.
      return { key: route, path: safePath, title: 'PineVela | ' + item[0], publicPage: item[1] === true };
    } catch (_) { return null; }
  }
  function safeReferrer() {
    try {
      var ref = new URL(document.referrer);
      // Do not forward authentication providers or any referrer's path/query.
      if (/supabase\.(?:co|com)$|accounts\.google\.com$|paystack\.(?:co|com)$/.test(ref.hostname)) return '';
      return /^https?:$/.test(ref.protocol) ? ref.origin + '/' : '';
    } catch (_) { return ''; }
  }
  function tag() { window.dataLayer.push(arguments); }
  function clearAnalyticsCookies() {
    var names = document.cookie.split(';').map(function (part) { return part.trim().split('=')[0]; }).filter(function (name) { return /^_ga(?:_|$)/.test(name); });
    var labels = location.hostname.split('.'), domains = [''];
    for (var i = 0; i < labels.length - 1; i++) { domains.push(labels.slice(i).join('.')); domains.push('.' + labels.slice(i).join('.')); }
    names.forEach(function (name) { domains.forEach(function (domain) {
      document.cookie = name + '=; Max-Age=0; path=/; SameSite=Lax' + (domain ? '; domain=' + domain : '') + (location.protocol === 'https:' ? '; Secure' : '');
    }); });
  }
  function disable() {
    var wasEnabled = window[DISABLE] === false;
    window[DISABLE] = true; lastKey = '';
    if (initialized && wasEnabled) tag('set', { page_location: 'https://pinevela.app/analytics-unavailable', page_title: 'PineVela', page_referrer: '' });
  }
  function sendPage(page) {
    if (!production || failed || choice !== 'granted' || privacySignal() || !page) { disable(); return; }
    var fields = { page_location: 'https://pinevela.app' + page.path, page_title: page.title, page_referrer: previousPage || safeReferrer() };
    if (!initialized) {
      window.dataLayer = window.dataLayer || [];
      window.gtag = tag;
      // Basic consent mode: no Google script/request exists before permission.
      tag('consent', 'default', { analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
      tag('set', { send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false, ads_data_redaction: true });
      tag('js', new Date());
      tag('consent', 'update', { analytics_storage: 'granted', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
      window[DISABLE] = false;
      tag('config', ID, Object.assign({}, fields, { send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false,
        cookie_expires: 2592000, cookie_update: false, cookie_path: '/', cookie_flags: 'SameSite=Lax;Secure' }));
      initialized = true;
      var script = document.createElement('script');
      script.id = 'pinevela-ga4-tag'; script.async = true; script.referrerPolicy = 'no-referrer';
      script.onerror = function () { failed = true; disable(); };
      script.src = 'https://www.googletagmanager.com/gtag/js?id=' + ID;
      document.head.appendChild(script);
    } else {
      tag('set', fields);
      window[DISABLE] = false;
    }
    if (lastKey === page.key) return;
    tag('event', 'page_view', Object.assign({ send_to: ID }, fields));
    lastKey = page.key; previousPage = fields.page_location;
  }
  function closePanel() {
    if (panel) panel.remove(); panel = null;
    if (returnFocus && returnFocus.isConnected) returnFocus.focus(); returnFocus = null;
  }
  function setChoice(next) {
    choice = next;
    try { localStorage.setItem(KEY, JSON.stringify({ version: 1, analytics: next })); } catch (_) { /* This document still honors the choice. */ }
    if (next === 'denied') {
      disable();
      if (initialized) tag('consent', 'update', { analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
      clearAnalyticsCookies();
    } else if (initialized) tag('consent', 'update', { analytics_storage: 'granted', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
    closePanel(); refresh();
    window.dispatchEvent(new Event('pinevela:analytics-choice'));
  }
  function openPanel(manual) {
    if (!document.body || panel) return;
    if (!document.getElementById('pinevela-analytics-style')) {
      var css = document.createElement('link'); css.id = 'pinevela-analytics-style'; css.rel = 'stylesheet'; css.href = '/analytics.css'; document.head.appendChild(css);
    }
    returnFocus = manual ? document.activeElement : null;
    panel = document.createElement('section'); panel.id = 'pinevela-analytics-choice'; panel.className = 'pv-analytics-choice';
    panel.setAttribute('role', 'region'); panel.setAttribute('aria-labelledby', 'pv-analytics-heading'); panel.tabIndex = -1;
    var heading = document.createElement('h2'); heading.id = 'pv-analytics-heading'; heading.textContent = 'Optional analytics'; panel.appendChild(heading);
    var copy = document.createElement('p'); copy.textContent = 'Allow Google Analytics to help us understand visits and improve PineVela? You can use the app either way.'; panel.appendChild(copy);
    var link = document.createElement('a'); link.href = '/privacy.html#analytics'; link.textContent = 'Privacy and analytics details'; panel.appendChild(link);
    if (privacySignal()) { var signal = document.createElement('p'); signal.textContent = 'Your browser privacy setting keeps analytics off.'; panel.appendChild(signal); }
    var actions = document.createElement('div'); actions.className = 'pv-analytics-actions';
    var decline = document.createElement('button'); decline.type = 'button'; decline.dataset.analyticsAction = 'deny'; decline.textContent = 'Decline'; decline.addEventListener('click', function () { setChoice('denied'); });
    var allow = document.createElement('button'); allow.type = 'button'; allow.dataset.analyticsAction = 'allow'; allow.textContent = 'Allow analytics'; allow.disabled = privacySignal(); allow.addEventListener('click', function () { setChoice('granted'); });
    actions.appendChild(decline); actions.appendChild(allow); panel.appendChild(actions);
    panel.addEventListener('keydown', function (event) { if (event.key === 'Escape') { dismissed = true; closePanel(); } });
    document.body.appendChild(panel); if (manual) panel.focus();
  }
  function refresh() {
    var page = describePage(); sendPage(page);
    if (!choice && !privacySignal() && !dismissed && page && page.publicPage) openPanel(false);
    else if (panel && !returnFocus && (!page || !page.publicPage)) closePanel();
  }
  choice = readChoice(); window[DISABLE] = true;
  window.PineVelaAnalytics = { refresh: refresh, preferences: function () { openPanel(true); }, choice: function () { return privacySignal() ? 'denied' : choice; } };
  window.addEventListener('hashchange', refresh);
  window.addEventListener('popstate', refresh);
  window.addEventListener('storage', function (event) { if (event.key === KEY || event.key === null) { choice = readChoice(); closePanel(); if (choice !== 'granted') { disable(); clearAnalyticsCookies(); } refresh(); } });
  document.addEventListener('click', function (event) {
    if (event.target instanceof Element && event.target.closest('[data-analytics-preferences]')) { event.preventDefault(); openPanel(true); }
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', refresh, { once: true }); else refresh();
})();
