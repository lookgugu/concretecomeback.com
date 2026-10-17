export const DISMISSAL_MS = 30 * 24 * 60 * 60 * 1000;
// Mirrors TOKEN_TTL_MS in functions/packages/forms/newsletter/newsletter.js.
// Once the link in the confirmation email has expired, the prompt may return so
// the visitor can request a fresh one.
export const PENDING_MS = 2 * 60 * 60 * 1000;
// The popup's only trigger. Five seconds is a floor, not a schedule: once it has
// elapsed the popup waits for an eligible moment (see initNewsletterSignup).
export const POPUP_DELAY_MS = 5000;
// The GA4 property behind GTM-N65JD942. Newsletter events must name it: on this
// site a destination-less gtag event is queued but never sent (verified in the
// October 8 audit by intercepting collection requests).
export const GA4_MEASUREMENT_ID = 'G-VYW5FDDX52';
// `newsletter_source` values for the server-rendered CTAs. Anything else falls
// back to in_post, so a typo in markup can never put free text into analytics.
export const INLINE_SOURCES = ['in_post', 'home_inline', 'parks_inline'];
const POPUP_SOURCE = 'popup';
// Routes where the popup never initialises: the listing form, the signup result
// pages, and the privacy policy the consent line links to.
const POPUP_EXCLUDED_PATHS = ['/submit', '/newsletter', '/privacy'];
// Share of the form that has to be on screen to count as an impression.
const IMPRESSION_RATIO = 0.5;
// Fired on document when any CTA gets a confirmation email sent, so the other
// CTAs mounted on the same page can stand down.
const SIGNUP_EVENT = 'cc:newsletter-pending';
// Fired on document when an inline CTA scrolls in or out of view or starts or
// finishes a request, so the popup can re-check whether it may appear.
const INLINE_STATE_EVENT = 'cc:newsletter-inline-state';
const GENERIC_ERROR = 'Signup is temporarily unavailable. Please try again.';

// Inline placements mounted on a document, read by the popup to decide whether
// it may appear. Keyed by document so each page (and each test) starts empty.
const placementsByDocument = new WeakMap();
function inlinePlacements() {
  let placements = placementsByDocument.get(document);
  if (!placements) {
    placements = new Set();
    placementsByDocument.set(document, placements);
  }
  return placements;
}

export function isPopupExcludedPath(pathname) {
  return POPUP_EXCLUDED_PATHS.some((path) => pathname.startsWith(path));
}

function isDocumentVisible() {
  return document.visibilityState === 'visible';
}

// A focused text field, select or checkbox means the visitor is filling
// something in — the directory search, the filters, the listing form — and a
// panel sliding over the bottom of the screen would interrupt them.
function isEditingControl(element) {
  if (!element) return false;
  if (element.isContentEditable) return true;
  const tag = String(element.tagName || '').toUpperCase();
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

// A signup form is in use while it has focus, holds a typed address, or has a
// request in flight. None of those may be covered, hidden or pulled away.
function isFormInUse(form, busy) {
  if (busy) return true;
  if (form.hidden) return false;
  const active = document.activeElement;
  if (active && typeof form.contains === 'function' && form.contains(active)) return true;
  const email = typeof form.querySelector === 'function' ? form.querySelector('input[type="email"]') : null;
  return Boolean(email && email.value);
}

// Even reading the `localStorage` global throws when a browser blocks site data,
// so resolve it once, defensively, and treat "no storage" as "never suppressed".
function getStorage() {
  try { return window.localStorage; } catch (_error) { return null; }
}

// Where this visitor already is in the signup flow, independent of whether they
// dismissed the popup. The inline CTA keys off this alone: dismissing the popup
// silences the popup, not every mention of the newsletter on the site.
export function signupCompletionState(storage, now = Date.now()) {
  if (!storage) return null;
  try {
    const signupStatus = storage.getItem('cc-newsletter-status');
    if (signupStatus === 'subscribed') return 'subscribed';
    if (signupStatus === 'pending') {
      const pendingAt = Number(storage.getItem('cc-newsletter-pending-at') || 0);
      if (pendingAt > 0 && now - pendingAt < PENDING_MS) return 'pending';
    }
    return null;
  } catch (_error) {
    return null;
  }
}

export function isSignupSuppressed(storage, now = Date.now()) {
  if (!storage) return false;
  if (signupCompletionState(storage, now)) return true;
  try {
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

// Two sinks on purpose. The dataLayer push is the GTM channel, but it only
// reaches GA4 once someone adds a custom-event trigger per event name in the
// GTM UI, and none exist. The gtag command is what actually reaches GA4 — but
// only because it names `send_to`: the container's Google tag sends an event
// without a destination nowhere. Do not add a `config` call here (it would
// send a second page_view), and do not add GTM tags for these event names
// while this call exists (every event would be counted twice).
//
// Params are a fixed placement source plus, for a stand-down, a fixed reason.
// Never pass anything the visitor typed or anything from a confirmation link.
// Analytics is best-effort: a sink that throws (an extension, a stub) must not
// block the signup request or the CTA coordination around it.
function track(event, source, extra = {}) {
  const params = { newsletter_source: source, ...extra };
  try {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ event, ...params });
  } catch (_error) {}
  try {
    // GTM's own GA4 tag does not create a page-level `gtag`, so define the
    // canonical wrapper rather than testing for one. It must push the raw
    // `arguments` object: that is the shape gtag.js reads commands in, and an
    // array is ignored.
    if (typeof window.gtag !== 'function') {
      window.gtag = function gtag() { window.dataLayer.push(arguments); };
    }
    window.gtag('event', event, { send_to: GA4_MEASUREMENT_ID, ...params });
  } catch (_error) {}
}

function inlineSource(panel) {
  const source = panel.dataset && panel.dataset.newsletterSource;
  return INLINE_SOURCES.includes(source) ? source : 'in_post';
}

export function initNewsletterSignup(panel) {
  const form = panel.querySelector('form');
  const closeButton = panel.querySelector('[data-newsletter-close]');
  const status = panel.querySelector('[data-newsletter-status]');
  const announcer = panel.querySelector('[data-newsletter-announce]');
  const storage = getStorage();
  if (!form || !closeButton || !status || isSignupSuppressed(storage)) return;

  // Eligibility policy. The popup is shown at most once per page, and only when
  // all of these hold at the same moment:
  //   - POPUP_DELAY_MS has elapsed since this page initialised it (never earlier);
  //   - the visitor has not dismissed, signed up or confirmed since load;
  //   - the tab is visible;
  //   - no inline CTA is on screen or in use (focused, typed into, submitting);
  //   - no form control anywhere on the page has focus.
  // When the five seconds are up but one of these fails, it does not give up:
  // it re-checks whenever one of them can change (focus moving, typing, the tab
  // becoming visible, an inline CTA scrolling away or finishing a request). So
  // a visitor who reads past the inline CTA can still get the popup later.
  // Once shown, it stands down — without a dismissal — if an inline CTA comes
  // into view while the popup itself is not in use, and never comes back on
  // this page. Scrolling and page count play no part.
  let elapsed = false;
  let shown = false;
  let finished = false;
  let busy = false;
  let queued = false;
  let timer;

  const inlineState = () => {
    let visible = false;
    let inUse = false;
    inlinePlacements().forEach((placement) => {
      if (placement.done) return;
      // `null` means not yet known (no observer entry yet, or no
      // IntersectionObserver at all). Fail closed: it may be on screen.
      if (placement.visible !== false) visible = true;
      if (placement.inUse()) inUse = true;
    });
    return { visible, inUse };
  };

  // Unhide now, reveal on the next frame so the slide-in transition runs. The
  // popup only counts as seen once that frame has painted it; until then a
  // hide() cancels the frame, so a late frame cannot bring a finished popup back.
  let frame = null;
  let revealed = false;
  const show = () => {
    shown = true;
    panel.hidden = false;
    frame = requestAnimationFrame(() => {
      frame = null;
      if (finished) return;
      revealed = true;
      panel.dataset.visible = 'true';
      // The panel never takes focus — it is an unsolicited promo, not a dialog —
      // so the one way assistive tech learns it exists is a polite live region.
      if (announcer) announcer.textContent = 'Newsletter signup available: get the weekly Concrete Comeback roundup.';
      track('newsletter_popup_shown', POPUP_SOURCE);
      // Painted only to a visible tab and fixed to the viewport, so this is an
      // impression in the same sense as an inline form half on screen.
      track('newsletter_impression', POPUP_SOURCE);
    });
  };

  // Only the explicit close button records the 30-day dismissal. Escape hides
  // the panel for this page alone, so a stray keypress cannot silence it for a month.
  const hide = (persist, event = 'newsletter_popup_dismissed', reason) => {
    finished = true;
    window.clearTimeout(timer);
    if (frame != null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame);
    frame = null;
    if (!shown) return;
    if (!revealed) {
      // Never painted: nobody saw it, so there is nothing to report.
      panel.hidden = true;
      return;
    }
    if (panel.dataset.visible !== 'true') return;
    panel.dataset.visible = 'false';
    if (persist) {
      try { if (storage) storage.setItem('cc-newsletter-dismissed-at', String(Date.now())); } catch (_error) {}
    }
    // A retreat is not a dismissal: counting one as the other would report a
    // successful inline conversion as the visitor rejecting the popup.
    track(event, POPUP_SOURCE, reason ? { newsletter_reason: reason } : {});
    window.setTimeout(() => { panel.hidden = true; }, 200);
  };

  const evaluate = () => {
    queued = false;
    if (finished) return;
    if (isSignupSuppressed(storage)) {
      // Signed up or dismissed in another tab since load.
      if (!shown) finished = true;
      return;
    }
    const inline = inlineState();
    if (!shown) {
      if (!elapsed || !isDocumentVisible()) return;
      if (inline.visible || inline.inUse) return;
      if (isEditingControl(document.activeElement)) return;
      show();
    } else if (inline.visible && !isFormInUse(form, busy)) {
      hide(false, 'newsletter_popup_stood_down', 'inline_visible');
    }
  };
  // Focus events report the element losing focus before activeElement moves,
  // so re-check on the next tick rather than inside the event.
  const reevaluate = () => {
    if (finished || queued) return;
    queued = true;
    window.setTimeout(evaluate, 0);
  };

  timer = window.setTimeout(() => { elapsed = true; evaluate(); }, POPUP_DELAY_MS);
  ['focusin', 'focusout', 'input', 'visibilitychange', INLINE_STATE_EVENT].forEach((type) => {
    document.addEventListener(type, reevaluate);
  });

  closeButton.addEventListener('click', () => hide(true));
  document.addEventListener('keydown', (event) => {
    if (shown && shouldHideOnEscape(event, document.activeElement, panel)) hide(false);
  });

  // If the visitor signs up through an inline CTA, the popup retreats rather
  // than repeating the confirmation — and without recording a dismissal, which
  // is reserved for the visitor actually closing it. Before it has been shown,
  // it simply never appears.
  bindNewsletterForm(panel, {
    storage,
    source: POPUP_SOURCE,
    onBusyChange: (value) => {
      busy = value;
      reevaluate();
    },
    onSuccess: () => {
      // The popup now holds the "check your inbox" confirmation; leave it be.
      finished = true;
    },
    onOtherSignup: () => hide(false, 'newsletter_popup_stood_down', 'signup_elsewhere'),
  });
}

// The submit path is identical for the popup and the in-post CTA, so both bind
// it here: one place that knows the endpoint contract, the pending bookkeeping
// and the error copy. Only the presentation around it differs.
export function bindNewsletterForm(panel, {
  storage = getStorage(),
  source,
  onOtherSignup,
  onBusyChange,
  onSuccess,
} = {}) {
  const form = panel.querySelector('form');
  const status = panel.querySelector('[data-newsletter-status]');
  if (!form || !status) return false;

  if (onOtherSignup) {
    document.addEventListener(SIGNUP_EVENT, (event) => {
      if (event.detail && event.detail.panel === panel) return;
      onOtherSignup();
    });
  }

  const setBusy = (value) => {
    if (onBusyChange) onBusyChange(value);
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submitButton = form.querySelector('button[type="submit"]');
    if (submitButton) submitButton.disabled = true;
    status.textContent = 'Sending your confirmation email…';
    setBusy(true);
    track('newsletter_signup_submitted', source);
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
      track('newsletter_signup_pending', source);
      if (onSuccess) onSuccess();
      setBusy(false);
      try {
        document.dispatchEvent(new CustomEvent(SIGNUP_EVENT, { detail: { panel } }));
      } catch (_error) {}
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : GENERIC_ERROR;
      if (submitButton) submitButton.disabled = false;
      track('newsletter_signup_error', source);
      setBusy(false);
    }
  });

  return true;
}

// The inline CTAs are part of the page, not an interruption: always rendered,
// never dismissed, no timers or scroll triggers. A visitor who has already
// signed up sees the outcome instead of the form.
export function showCompletedState(panel, state) {
  const form = panel.querySelector('form');
  const status = panel.querySelector('[data-newsletter-status]');
  if (form) form.hidden = true;
  if (status) {
    status.textContent = state === 'subscribed'
      ? "You're subscribed to the weekly roundup."
      : 'Check your inbox and confirm your subscription.';
  }
}

// Counts one `newsletter_impression` for this mounted form, the first time at
// least half of it is on screen in a visible tab while it is still a live form.
// Server-rendered markup is in every page's DOM, so presence alone proves
// nothing; and a page a visitor never scrolls to the form must not count.
// Keeps observing afterwards, because the popup needs to know whether the
// form is on screen at all.
function observePlacement(placement) {
  const { form } = placement;
  if (typeof IntersectionObserver !== 'function') return;
  let ratio = 0;
  let counted = false;
  const countImpression = () => {
    if (counted || placement.done || form.hidden) return;
    if (!isDocumentVisible() || ratio < IMPRESSION_RATIO) return;
    counted = true;
    track('newsletter_impression', placement.source);
  };
  const observer = new IntersectionObserver((entries) => {
    const wasVisible = placement.visible;
    entries.forEach((entry) => {
      if (entry.target !== form) return;
      ratio = entry.isIntersecting ? entry.intersectionRatio : 0;
      placement.visible = ratio > 0;
    });
    countImpression();
    if (placement.visible !== wasVisible) placement.notify();
  }, { threshold: [0, 0.25, IMPRESSION_RATIO, 0.75, 1] });
  observer.observe(form);
  // A form left on screen in a background tab is counted when the tab returns.
  document.addEventListener('visibilitychange', countImpression);
}

export function initInlineNewsletterSignup(panel) {
  const storage = getStorage();
  const source = inlineSource(panel);
  const state = signupCompletionState(storage);
  if (state) {
    showCompletedState(panel, state);
    return;
  }
  const form = panel.querySelector('form');
  if (!form) return;

  let busy = false;
  const placement = {
    form,
    source,
    // true/false once an observer entry arrives; null until then, and for
    // good without IntersectionObserver. The popup treats null as on screen.
    visible: null,
    done: false,
    inUse: () => isFormInUse(form, busy),
    notify: () => {
      try { document.dispatchEvent(new CustomEvent(INLINE_STATE_EVENT)); } catch (_error) {}
    },
  };
  inlinePlacements().add(placement);

  // A page can mount several CTAs, so the ones that weren't submitted have to
  // be told: none reads storage again after init, and leaving a live form next
  // to "check your inbox" invites a duplicate submission.
  bindNewsletterForm(panel, {
    storage,
    source,
    onBusyChange: (value) => {
      busy = value;
      placement.notify();
    },
    onSuccess: () => { placement.done = true; },
    onOtherSignup: () => {
      placement.done = true;
      showCompletedState(panel, 'pending');
    },
  });
  observePlacement(placement);
}
