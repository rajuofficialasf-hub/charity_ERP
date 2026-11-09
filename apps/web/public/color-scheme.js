// The page's light or dark mode before the first paint, as the asf theme sets it once the app runs:
// the person's own pick on this device, else the device's mode. Without it a dark device shows a
// white page until the app has loaded. A file of its own, not an inline script, so the content
// security policy (docs/security/SECURITY_POLICY.md, "Headers") needs no exception. The key is the
// asf provider's mode key in src/ui/templates/asf/components/ui-provider.tsx.
/* global window, document */
(function () {
  var mode;
  try {
    mode = window.localStorage.getItem('asf-mode');
  } catch {
    // storage closed (a private window): follow the device
  }
  if (mode !== 'light' && mode !== 'dark') {
    mode =
      window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
  }
  document.documentElement.setAttribute('data-color-scheme', mode);
})();
