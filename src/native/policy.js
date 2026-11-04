// The disconnected preview never hands navigation to an external website or
// provider. This listener also runs on the locally copied policy documents.
(() => {
  document.addEventListener('click', event => {
    const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
    if (!anchor) return;
    const destination = new URL(anchor.getAttribute('href'), location.href);
    if (document.documentElement.dataset.nativePreview !== 'true') {
      // The native WebView client opens external HTTPS links in the browser;
      // force target=_self so no secondary WebView can inherit bridge access.
      anchor.target = '_self';
      return;
    }
    if (destination.origin === location.origin) {
      if (anchor.target === '_blank') {
        event.preventDefault();
        location.assign(destination.href);
      }
      return;
    }
    event.preventDefault();
    let notice = document.querySelector('[data-native-link-notice]');
    if (!notice) {
      notice = document.createElement('p');
      notice.className = 'native-preview-link-notice';
      notice.setAttribute('data-native-link-notice', '');
      notice.setAttribute('role', 'status');
      document.body.appendChild(notice);
    }
    notice.textContent = 'External links will be connected in the next step. You can keep reading this preview.';
  }, true);
})();
