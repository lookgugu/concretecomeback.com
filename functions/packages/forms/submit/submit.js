// Receives POSTs from the /submit form and emails the submission via Resend.
// Deployed as a DigitalOcean Functions web action; form-encoded body fields
// arrive as properties of `args`.

const FIELD_LABELS = [
  ['listing-type', 'Listing type'],
  ['name', 'Name'],
  ['city', 'City'],
  ['country', 'Country'],
  ['website', 'Website'],
  ['difficulty', 'Difficulty'],
  ['adult-friendly', 'Adult friendly (40+)'],
  ['entry-fee', 'Entry fee'],
  ['instagram', 'Instagram'],
  ['adult-advice', 'Adult advice offered'],
  ['age-range', 'Age range'],
  ['meet-frequency', 'Meeting schedule'],
  ['is-online', 'Online-only'],
  ['description', 'Description'],
  ['email', 'Submitter email'],
];

const REQUIRED = ['listing-type', 'name', 'city', 'country', 'description'];

const ALLOWED_LISTING_TYPES = new Set(['park', 'shop', 'group']);
const ALLOWED_COUNTRIES = new Set(['US', 'UK', 'CA', 'AU']);
const FIELD_LIMITS = {
  'listing-type': 10,
  name: 120,
  city: 120,
  country: 2,
  website: 500,
  difficulty: 40,
  'adult-friendly': 10,
  'entry-fee': 100,
  instagram: 100,
  'adult-advice': 10,
  'age-range': 100,
  'meet-frequency': 200,
  'is-online': 10,
  description: 3000,
  email: 320,
};

const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 3;
const submissionTimes = new Map();

function getHeader(args, name) {
  const headers = (args.http && args.http.headers) || args.__ow_headers || {};
  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === target) return String(value);
  }
  return '';
}

function clientAddress(args) {
  const forwarded = getHeader(args, 'x-forwarded-for');
  return (forwarded.split(',')[0] || getHeader(args, 'x-real-ip')).trim();
}

function isRateLimited(client, now = Date.now()) {
  if (!client) return false;

  const recent = (submissionTimes.get(client) || [])
    .filter((timestamp) => now - timestamp < RATE_LIMIT_WINDOW_MS);

  if (recent.length >= RATE_LIMIT_MAX) {
    submissionTimes.set(client, recent);
    return true;
  }

  recent.push(now);
  submissionTimes.set(client, recent);
  return false;
}

// DO's web action usually parses a form-encoded body into `args`, but if the
// fields didn't arrive parsed, fall back to decoding the raw body ourselves.
function withFormBody(args) {
  const hasFields = REQUIRED.some((key) => args[key] != null);
  const raw = args.__ow_body;
  if (hasFields || !raw) return args;
  try {
    const decoded =
      args.__ow_isBase64Encoded === false
        ? String(raw)
        : Buffer.from(String(raw), 'base64').toString('utf8');
    const merged = { ...args };
    for (const [key, value] of new URLSearchParams(decoded)) merged[key] = value;
    return merged;
  } catch (_err) {
    return args;
  }
}

function redirect(location) {
  return { statusCode: 303, headers: { location }, body: '' };
}

function errorPage(message, statusCode = 502, extraHeaders = {}) {
  return {
    statusCode,
    headers: { 'content-type': 'text/html; charset=utf-8', ...extraHeaders },
    body: `<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Submission failed</title>
<div style="font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem">
<h1>Sorry — that didn't go through</h1>
<p>${message}</p>
<p><a href="/submit">Go back and try again</a>, or email us your listing directly at
<a href="mailto:hello@concretecomeback.com">hello@concretecomeback.com</a>.</p>
</div>`,
  };
}

// Post-deploy smoke test: GET /api/forms/submit?health=1 reports whether the
// route, function, and both secrets are wired. It only checks that the secrets
// are present — no outbound call and no secret values, so it is safe on a
// public unauthenticated endpoint. A send-only Resend key can only be validated
// by actually sending, so confirm the key itself with one real test submission.
function healthCheck() {
  const hasApiKey = !!process.env.RESEND_API_KEY;
  const hasNotify = !!process.env.SUBMIT_NOTIFY_EMAIL;
  return {
    statusCode: 200,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ok: hasApiKey && hasNotify, hasApiKey, hasNotify }),
  };
}

async function main(args) {
  // DO's current runtime exposes the verb as args.http.method; __ow_method is legacy.
  const method = String((args.http && args.http.method) || args.__ow_method || 'post').toLowerCase();

  // GET-only so a form POST that happens to carry a `health` field can't be
  // diverted into the health check instead of being processed.
  if (method === 'get' && args.health) {
    return healthCheck();
  }
  if (method !== 'post') {
    return redirect('/submit/');
  }

  args = withFormBody(args);

  // Honeypot: bots fill the hidden field; pretend success and drop it.
  if (args._gotcha) {
    return redirect('/submit/thanks/');
  }

  const missing = REQUIRED.filter((key) => !String(args[key] || '').trim());
  if (missing.length > 0) {
    return errorPage(`Some required fields were missing: ${missing.join(', ')}.`, 400);
  }

  const listingType = String(args['listing-type']).trim();
  const country = String(args.country).trim();
  if (!ALLOWED_LISTING_TYPES.has(listingType) || !ALLOWED_COUNTRIES.has(country)) {
    return errorPage('The listing type or country was invalid.', 400);
  }

  for (const [key, maxLength] of Object.entries(FIELD_LIMITS)) {
    if (String(args[key] || '').trim().length > maxLength) {
      return errorPage(`${key} was longer than the allowed maximum.`, 400);
    }
  }

  const submitterEmail = String(args.email || '').trim();
  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(submitterEmail);
  if (submitterEmail && !isValidEmail) {
    return errorPage('The submitter email address was invalid.', 400);
  }

  const client = clientAddress(args);
  if (isRateLimited(client)) {
    return errorPage(
      'Too many submissions were received from this address. Please try again in 10 minutes.',
      429,
      { 'retry-after': '600' },
    );
  }

  const apiKey = process.env.RESEND_API_KEY;
  const notifyEmail = process.env.SUBMIT_NOTIFY_EMAIL;
  if (!apiKey || !notifyEmail) {
    return errorPage('The form is not fully configured yet.');
  }

  const lines = FIELD_LABELS
    .map(([key, label]) => {
      const value = String(args[key] || '').trim();
      return value ? `${label}: ${value}` : null;
    })
    .filter(Boolean);

  const payload = {
    from: 'Concrete Comeback <submissions@concretecomeback.com>',
    to: [notifyEmail],
    subject: `New listing submission: ${String(args.name).trim()} (${args['listing-type']})`,
    text: lines.join('\n'),
  };
  if (submitterEmail && isValidEmail) {
    payload.reply_to = [submitterEmail];
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.error('Resend API error', res.status, detail);
      return errorPage('We could not deliver your submission right now.');
    }
  } catch (err) {
    console.error('Resend request failed', err);
    return errorPage('We could not deliver your submission right now.');
  }

  return redirect('/submit/thanks/');
}

exports.main = main;
