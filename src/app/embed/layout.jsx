/**
 * /embed layout. It announces to the host that the iframe is alive with an inline script that runs
 * as soon as the HTML is parsed, independently of React: 7hub shows an error if no `ready` arrives
 * within 8 seconds, and tying that to hydration would turn any bundle hiccup into "not responding".
 *
 * The origin check is repeated by hand instead of importing shared/embed/hostBridge.js: importing
 * it would pull it back into the bundle this script exists to avoid. The message carries the build
 * time, so the host can tell which release the iframe runs.
 */

// evaluated at build time: this is a server component and the export is static
const RELEASED_AT = new Date().toISOString();

// LEGACY(host protocol v1): `tipo: 'pronto'` is kept for hosts not yet on the English protocol.
const ANNOUNCE_READY_SCRIPT = `
(function () {
  if (window.parent === window) return;

  var TRUSTED_DOMAIN = '7hub.it';
  var TRUSTED_LOCALHOSTS = ['http://localhost:3000', 'http://127.0.0.1:3000'];

  function isTrusted(origin) {
    if (!origin) return false;
    if (TRUSTED_LOCALHOSTS.indexOf(origin) !== -1) return true;
    try {
      var url = new URL(origin);
      if (url.protocol !== 'https:') return false;
      return url.hostname === TRUSTED_DOMAIN || url.hostname.slice(-(TRUSTED_DOMAIN.length + 1)) === '.' + TRUSTED_DOMAIN;
    } catch (e) {
      return false;
    }
  }

  var candidates = [];
  try {
    var ancestors = window.location.ancestorOrigins;
    if (ancestors && ancestors.length) candidates.push(ancestors[0]);
  } catch (e) {}
  if (document.referrer) {
    try { candidates.push(new URL(document.referrer).origin); } catch (e) {}
  }

  for (var i = 0; i < candidates.length; i++) {
    if (isTrusted(candidates[i])) {
      window.parent.postMessage({ type: 'ready', tipo: 'pronto', releasedAt: '${RELEASED_AT}' }, candidates[i]);
      return;
    }
  }
})();
`;

export default function EmbedLayout({ children }) {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: ANNOUNCE_READY_SCRIPT }} />
      {children}
    </>
  );
}
