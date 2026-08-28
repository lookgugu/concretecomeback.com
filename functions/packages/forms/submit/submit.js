// Receives POSTs from the /submit form and emails the submission via Resend.
// Deployed as a DigitalOcean Functions web action; form-encoded body fields
// arrive as properties of `args`.

const FIELD_LABELS = {
  'listing-type': 'Listing type',
  name: 'Name',
  city: 'City',
  country: 'Country',
  website: 'Website',
  difficulty: 'Difficulty',
  'adult-friendly': 'Welcoming to older skaters',
  'entry-fee': 'Entry fee',
  instagram: 'Instagram',
  'adult-advice': 'Advice for older skaters offered',
  'age-range': 'Age range',
  'meet-frequency': 'Meeting schedule',
  'is-online': 'Online-only',
  description: 'Description',
  email: 'Submitter email',
};

const COMMON_FIELDS = [
  'listing-type',
  'name',
  'city',
  'country',
  'website',
  'description',
  'email',
];

const TYPE_FIELDS = {
  park: ['difficulty', 'adult-friendly', 'entry-fee'],
  shop: ['instagram', 'adult-advice'],
  group: ['age-range', 'meet-frequency', 'is-online'],
};

const REQUIRED = ['listing-type', 'name', 'city', 'country', 'description'];

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

function submissionFailure(code, detail = {}) {
  // Keep diagnosis in provider logs, never in the redirect URL shown to visitors.
  // Callers pass only field names, status codes, and provider error metadata —
  // never form values, email contents, configuration values, or secrets.
  console.error('Submission failed', { code, ...detail });
  return redirect('/submit/error/');
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
    return submissionFailure('missing_required_fields', { fields: missing });
  }

  const listingType = String(args['listing-type']).trim();
  if (!Object.hasOwn(TYPE_FIELDS, listingType)) {
    return submissionFailure('invalid_listing_type');
  }

  const apiKey = process.env.RESEND_API_KEY;
  const notifyEmail = process.env.SUBMIT_NOTIFY_EMAIL;
  if (!apiKey || !notifyEmail) {
    const missingConfiguration = [];
    if (!apiKey) missingConfiguration.push('RESEND_API_KEY');
    if (!notifyEmail) missingConfiguration.push('SUBMIT_NOTIFY_EMAIL');
    return submissionFailure('missing_configuration', { settings: missingConfiguration });
  }

  const lines = [...COMMON_FIELDS, ...TYPE_FIELDS[listingType]]
    .map((key) => {
      const value = String(args[key] || '').trim();
      return value ? `${FIELD_LABELS[key]}: ${value}` : null;
    })
    .filter(Boolean);

  // Invalid reply-to would fail the whole Resend request; the raw value is
  // still included in the email body either way.
  const submitterEmail = String(args.email || '').trim();
  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(submitterEmail);

  const payload = {
    from: 'Concrete Comeback <submissions@concretecomeback.com>',
    to: [notifyEmail],
    subject: `New listing submission: ${String(args.name).trim()} (${listingType})`,
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
      return submissionFailure('resend_api_error', {
        status: res.status,
        detail: detail.slice(0, 1000),
      });
    }
  } catch (err) {
    return submissionFailure('resend_request_failed', {
      name: err instanceof Error ? err.name : 'UnknownError',
      message: err instanceof Error ? err.message : String(err),
    });
  }

  return redirect('/submit/thanks/');
}

exports.main = main;
