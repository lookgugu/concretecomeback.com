// The one place a site script hands an event to GA4. Shared by the newsletter
// CTAs and the article tracker so both keep the same routing rules.
//
// Two sinks on purpose. The dataLayer push is the GTM channel, but it only
// reaches GA4 once someone adds a custom-event trigger per event name in the
// GTM UI, and none exist. The gtag command is what actually reaches GA4 — but
// only because it names `send_to`: the container's Google tag sends an event
// without a destination nowhere. Do not add a `config` call here (it would
// send a second page_view), and do not add GTM tags for these event names
// while this call exists (every event would be counted twice).
//
// Analytics is best-effort: a sink that throws (an extension, a stub) must not
// block anything the visitor is doing.

export const GA4_MEASUREMENT_ID = 'G-VYW5FDDX52';

// QA suppression. Setting either of these stops every event sent through this
// module (newsletter_* and article_*), locally, in that browser only:
//   localStorage.setItem('cc-analytics-suppress', '1')
//   window.__CC_ANALYTICS_SUPPRESS__ = true   (before page scripts run)
// It does NOT stop GTM's own page_view: that tag fires from the container,
// outside this module. Browser QA must still block collection at the network.
export const SUPPRESS_STORAGE_KEY = 'cc-analytics-suppress';

export function isAnalyticsSuppressed(win = typeof window === 'undefined' ? undefined : window) {
  if (!win) return true;
  try {
    if (win.__CC_ANALYTICS_SUPPRESS__ === true) return true;
  } catch (_error) {}
  try {
    return Boolean(win.localStorage) && win.localStorage.getItem(SUPPRESS_STORAGE_KEY) === '1';
  } catch (_error) {
    return false;
  }
}

export function sendEvent(event, params = {}, win = typeof window === 'undefined' ? undefined : window) {
  if (!win || isAnalyticsSuppressed(win)) return false;
  try {
    win.dataLayer = win.dataLayer || [];
    win.dataLayer.push({ event, ...params });
  } catch (_error) {}
  try {
    // GTM's own GA4 tag does not create a page-level `gtag`, so define the
    // canonical wrapper rather than testing for one. It must push the raw
    // `arguments` object: that is the shape gtag.js reads commands in, and an
    // array is ignored.
    if (typeof win.gtag !== 'function') {
      win.gtag = function gtag() { win.dataLayer.push(arguments); };
    }
    win.gtag('event', event, { send_to: GA4_MEASUREMENT_ID, ...params });
  } catch (_error) {}
  return true;
}
