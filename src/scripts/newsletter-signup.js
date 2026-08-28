export const DISMISSAL_MS = 30 * 24 * 60 * 60 * 1000;
export const PENDING_MS = 24 * 60 * 60 * 1000;

export function isSignupSuppressed(storage, now = Date.now()) {
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

function track(event) {
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ event });
}

export function initNewsletterSignup(panel) {
  const form = panel.querySelector('form');
  const closeButton = panel.querySelector('[data-newsletter-close]');
  const status = panel.querySelector('[data-newsletter-status]');
  if (!form || !closeButton || !status || isSignupSuppressed(localStorage)) return;

  let shown = false;
  let timer;
  const show = () => {
    if (shown || isSignupSuppressed(localStorage)) return;
    shown = true;
    panel.hidden = false;
    requestAnimationFrame(() => panel.dataset.visible = 'true');
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

  closeButton.addEventListener('click', () => {
    panel.dataset.visible = 'false';
    try { localStorage.setItem('cc-newsletter-dismissed-at', String(Date.now())); } catch (_error) {}
    track('newsletter_popup_dismissed');
    window.setTimeout(() => { panel.hidden = true; }, 200);
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submitButton = form.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    status.textContent = 'Sending your confirmation email…';
    track('newsletter_signup_submitted');
    try {
      const result = await fetch(form.action, { method: 'POST', body: new FormData(form), headers: { Accept: 'application/json' } });
      const payload = await result.json();
      if (!result.ok || !payload.ok) throw new Error(payload.error || 'Signup failed');
      form.hidden = true;
      status.textContent = 'Check your inbox and confirm your subscription.';
      try {
        localStorage.setItem('cc-newsletter-status', 'pending');
        localStorage.setItem('cc-newsletter-pending-at', String(Date.now()));
      } catch (_error) {}
      track('newsletter_signup_pending');
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : 'Signup is temporarily unavailable. Please try again.';
      submitButton.disabled = false;
      track('newsletter_signup_error');
    }
  });
}
