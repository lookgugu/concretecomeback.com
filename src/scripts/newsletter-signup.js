export const DISMISSAL_MS = 30 * 24 * 60 * 60 * 1000;
// Mirrors TOKEN_TTL_MS in functions/packages/forms/newsletter/newsletter.js.
// Once the link in the confirmation email has expired, the prompt may return so
// the visitor can request a fresh one.
export const PENDING_MS = 2 * 60 * 60 * 1000;
const GENERIC_ERROR = 'Signup is temporarily unavailable. Please try again.';

// Even reading the `localStorage` global throws when a browser blocks site data,
// so resolve it once, defensively, and treat "no storage" as "never suppressed".
function getStorage() {
  try { return window.localStorage; } catch (_error) { return null; }
}

export function isSignupSuppressed(storage, now = Date.now()) {
  if (!storage) return false;
  try {
    const signupStatus = storage.getItem('cc-newsletter-status');
    if (signupStatus === 'subscribed') return true;
    if (signupStatus === 'pending') {
      const pendingAt = Number(storage.getItem('cc-newsletter-pending-at') || 0);
      if (pendingAt > 0 && now - pendingAt < PENDING_MS) return true;
    }
    const dismissedAt = Number(storage.getItem('cc-newsletter-dismissed-at') || 0);
    return dismissedAt > 0 && now - dismissedAt < DISMISSAL_MS;
  } catch (_error) {
    return false;
  }
}

// Escape closes the panel only when the visitor is actually in it, and never
// while they are typing: the Escape that closes a browser autofill dropdown is
// delivered to the page as well, and swallowing a half-typed address is worse
// than leaving the panel open.
export function shouldHideOnEscape(event, activeElement, panel) {
  if (event.key !== 'Escape' || event.defaultPrevented) return false;
  if (!activeElement || !panel.contains(activeElement)) return false;
  if (typeof activeElement.value === 'string' && activeElement.value !== '') return false;
  return true;
}

function track(event) {
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ event });
}

export function initNewsletterSignup(panel) {
  const form = panel.querySelector('form');
  const closeButton = panel.querySelector('[data-newsletter-close]');
  const status = panel.querySelector('[data-newsletter-status]');
  const announcer = panel.querySelector('[data-newsletter-announce]');
  const storage = getStorage();
  if (!form || !closeButton || !status || isSignupSuppressed(storage)) return;

  let shown = false;
  let timer;
  const show = () => {
    if (shown || isSignupSuppressed(storage)) return;
    shown = true;
    panel.hidden = false;
    requestAnimationFrame(() => panel.dataset.visible = 'true');
    // The panel never takes focus — it is an unsolicited promo, not a dialog —
    // so the one way assistive tech learns it exists is a polite live region.
    if (announcer) announcer.textContent = 'Newsletter signup available: get the monthly Concrete Comeback roundup.';
    track('newsletter_popup_shown');
    window.removeEventListener('scroll', onScroll);
    clearTimeout(timer);
  };
  const onScroll = () => {
    const scrollable = document.documentElement.scrollHeight - window.innerHeight;
    if (scrollable > 0 && window.scrollY / scrollable >= 0.5) show();
  };

  let pageViews = 1;
  try {
    pageViews = Number(sessionStorage.getItem('cc-page-views') || 0) + 1;
    sessionStorage.setItem('cc-page-views', String(pageViews));
  } catch (_error) {}

  timer = window.setTimeout(show, pageViews >= 2 ? 1500 : 45000);
  window.addEventListener('scroll', onScroll, { passive: true });

  // Only the explicit close button records the 30-day dismissal. Escape hides
  // the panel for this page alone, so a stray keypress cannot silence it for a month.
  const hide = (persist) => {
    if (panel.dataset.visible !== 'true') return;
    panel.dataset.visible = 'false';
    if (persist) {
      try { if (storage) storage.setItem('cc-newsletter-dismissed-at', String(Date.now())); } catch (_error) {}
    }
    track('newsletter_popup_dismissed');
    window.setTimeout(() => { panel.hidden = true; }, 200);
  };

  closeButton.addEventListener('click', () => hide(true));
  document.addEventListener('keydown', (event) => {
    if (shouldHideOnEscape(event, document.activeElement, panel)) hide(false);
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submitButton = form.querySelector('button[type="submit"]');
    if (submitButton) submitButton.disabled = true;
    status.textContent = 'Sending your confirmation email…';
    track('newsletter_signup_submitted');
    try {
      // DO Functions only parses JSON and form-urlencoded bodies into the action's
      // arguments; a multipart FormData body arrives base64-encoded instead and the
      // fields never reach the function. Send urlencoded and let the browser set
      // the matching content type.
      const result = await fetch(form.action, {
        method: 'POST',
        body: new URLSearchParams(new FormData(form)),
        headers: { Accept: 'application/json' },
      });
      // DO masks any 5xx from the function with a generic HTML error page, so a
      // JSON body is not guaranteed. Never surface a parser error to the visitor.
      const payload = await result.json().catch(() => null);
      if (!result.ok || !payload || !payload.ok) {
        throw new Error((payload && payload.error) || GENERIC_ERROR);
      }
      form.hidden = true;
      status.textContent = 'Check your inbox and confirm your subscription.';
      try {
        if (storage) {
          storage.setItem('cc-newsletter-status', 'pending');
          storage.setItem('cc-newsletter-pending-at', String(Date.now()));
        }
      } catch (_error) {}
      track('newsletter_signup_pending');
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : GENERIC_ERROR;
      if (submitButton) submitButton.disabled = false;
      track('newsletter_signup_error');
    }
  });
}
