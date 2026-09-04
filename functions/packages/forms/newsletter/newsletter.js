const { createHmac, timingSafeEqual } = require('node:crypto');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Deliberately short. The function is stateless, so nothing invalidates a link
// once it has been used: the TTL *is* the window in which a confirmation can be
// replayed, including to re-subscribe someone who unsubscribed in between.
const TOKEN_TTL_MS = 2 * 60 * 60 * 1000;
// Wall-clock budget shared by every Resend call inside one confirmation. It has
// to fit within the 15s `limits.timeout` in project.yml with room to spare, or
// DO kills the invocation before the branded error redirect can be returned.
const CONFIRM_BUDGET_MS = 12000;
const DEFAULT_REQUEST_TIMEOUT_MS = 8000;
const MIN_REQUEST_TIMEOUT_MS = 1000;
const SITE_URL = 'https://concretecomeback.com';

function response(statusCode, body, contentType = 'application/json') {
  return {
    statusCode,
    headers: {
      'content-type': contentType,
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
    body: contentType === 'application/json' ? JSON.stringify(body) : body,
  };
}

function redirect(location) {
  return { statusCode: 303, headers: { location, 'cache-control': 'no-store' }, body: '' };
}

function withFormBody(args) {
  if (args.email != null || args.confirmation_token != null || !args.__ow_body) return args;
  try {
    const decoded = args.__ow_isBase64Encoded === false
      ? String(args.__ow_body)
      : Buffer.from(String(args.__ow_body), 'base64').toString('utf8');
    const merged = { ...args };
    for (const [key, value] of new URLSearchParams(decoded)) merged[key] = value;
    return merged;
  } catch (_error) {
    return args;
  }
}

function sign(value, secret) {
  return createHmac('sha256', secret).update(value).digest('base64url');
}

function createToken(email, secret, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ email, expires: now + TOKEN_TTL_MS })).toString('base64url');
  return `${payload}.${sign(payload, secret)}`;
}

function readToken(token, secret, now = Date.now()) {
  if (!token || !secret) return null;
  const [payload, signature, extra] = String(token).split('.');
  if (!payload || !signature || extra) return null;
  const expected = Buffer.from(sign(payload, secret));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    const email = String(parsed.email || '').trim().toLowerCase();
    // Compare positively so a payload with a missing or unparseable expiry fails closed.
    if (!EMAIL_RE.test(email) || email.length > 254 || !(Number(parsed.expires) > now)) return null;
    return email;
  } catch (_error) {
    return null;
  }
}

function confirmationPage(token) {
  const safeToken = String(token).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>Confirm your subscription | Concrete Comeback</title>
<style>body{margin:0;background:#f7f6f3;color:#292724;font:18px/1.6 system-ui,sans-serif}.card{max-width:38rem;margin:10vh auto;padding:2rem;background:#fff;border:1px solid #ddd8d0;border-radius:1rem;box-shadow:0 8px 30px #0001}h1{font-family:Impact,system-ui,sans-serif;line-height:1.1}button{min-height:48px;border:0;border-radius:.6rem;background:#e66b24;color:#fff;padding:.75rem 1.2rem;font:700 1rem system-ui;cursor:pointer}a{color:#292724}</style></head>
<body><main class="card"><p>CONCRETE COMEBACK</p><h1>One last push</h1><p>Confirm that you want the monthly roundup of new skate spots, practical comeback advice, and community stories.</p>
<form method="post" action="/api/forms/newsletter"><input type="hidden" name="confirmation_token" value="${safeToken}"><button type="submit">Confirm my subscription</button></form>
<p><a href="/">Return to Concrete Comeback</a></p></main></body></html>`;
}

// How long a single request may take. Given a deadline, the call gets whatever
// is left of the shared budget, floored so an exhausted budget fails fast rather
// than hanging until the platform timeout.
function timeoutBudget(deadline, now = Date.now()) {
  if (!deadline) return DEFAULT_REQUEST_TIMEOUT_MS;
  return Math.max(MIN_REQUEST_TIMEOUT_MS, deadline - now);
}

async function resendRequest(path, apiKey, options, deadline) {
  return fetch(`https://api.resend.com${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    signal: AbortSignal.timeout(timeoutBudget(deadline)),
  });
}

// Resend retains idempotency keys for 24 hours — longer than a link lives. Bucket
// the key by the token TTL so a double-submit shares one send, but a visitor
// whose link expired, bounced, or never arrived can get a fresh one afterwards.
// The address is hashed so a retry cannot expose it in provider logs.
function idempotencyKey(email, secret, now = Date.now()) {
  return `newsletter-confirmation/${sign(`${email}:${Math.floor(now / TOKEN_TTL_MS)}`, secret)}`;
}

async function startSignup(args) {
  const email = String(args.email || '').trim().toLowerCase();
  if (args._gotcha) return response(202, { ok: true, status: 'pending' });
  if (!EMAIL_RE.test(email) || email.length > 254 || args.consent !== 'yes') {
    return response(400, { ok: false, error: 'Enter a valid email and agree to receive the roundup.' });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const secret = process.env.NEWSLETTER_CONFIRM_SECRET;
  if (!apiKey || !secret) {
    console.error('Newsletter signup failed', { code: 'missing_configuration' });
    return response(503, { ok: false, error: 'Signup is temporarily unavailable. Please try again.' });
  }

  const token = createToken(email, secret);
  const confirmUrl = `${SITE_URL}/api/forms/newsletter?token=${encodeURIComponent(token)}`;
  const payload = {
    from: 'Concrete Comeback <hello@concretecomeback.com>',
    to: [email],
    subject: 'Confirm your Concrete Comeback roundup',
    text: `Confirm your subscription to the monthly Concrete Comeback roundup:\n\n${confirmUrl}\n\nIf you did not request this, you can ignore this email.`,
    html: `<p>Confirm your subscription to the monthly Concrete Comeback roundup.</p><p><a href="${confirmUrl}">Confirm my subscription</a></p><p>If you did not request this, you can ignore this email.</p>`,
  };

  try {
    const result = await resendRequest('/emails', apiKey, {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'Idempotency-Key': idempotencyKey(email, secret) },
    });
    if (result.status === 409) {
      // Resend suppressed a duplicate send inside the current bucket. Keep the
      // public response indistinguishable from a first request, but leave a
      // trace: a visitor whose first email bounced is told "check your inbox"
      // with nothing arriving, and this line is the only evidence of why.
      console.warn('Newsletter signup deduplicated', { code: 'confirmation_email_suppressed' });
      return response(202, { ok: true, status: 'pending' });
    }
    if (!result.ok) {
      console.error('Newsletter signup failed', { code: 'confirmation_email_failed', status: result.status });
      return response(502, { ok: false, error: 'We could not send the confirmation email. Please try again.' });
    }
    return response(202, { ok: true, status: 'pending' });
  } catch (error) {
    console.error('Newsletter signup failed', { code: 'confirmation_request_failed', name: error instanceof Error ? error.name : 'UnknownError' });
    return response(502, { ok: false, error: 'We could not send the confirmation email. Please try again.' });
  }
}

async function confirmSignup(token) {
  const secret = process.env.NEWSLETTER_CONFIRM_SECRET;
  const email = readToken(token, secret);
  if (!email) return redirect('/newsletter/error/');

  const apiKey = process.env.RESEND_CONTACTS_API_KEY;
  if (!apiKey) {
    console.error('Newsletter confirmation failed', { code: 'missing_contacts_api_key' });
    return redirect('/newsletter/error/');
  }

  const deadline = Date.now() + CONFIRM_BUDGET_MS;
  try {
    // Resend answers POST /contacts with 2xx for an address that already exists
    // and does not document whether the body's `unsubscribed` is applied, so a
    // create cannot be trusted to reactivate a lapsed subscriber. Update first —
    // it is the path for anyone who has ever been on the list — and only create
    // when Resend says the contact does not exist.
    const updateResult = await resendRequest(`/contacts/${encodeURIComponent(email)}`, apiKey, {
      method: 'PATCH',
      body: JSON.stringify({ unsubscribed: false }),
    }, deadline);
    if (!updateResult.ok) {
      if (updateResult.status !== 404) {
        throw new Error(`Contact update failed with ${updateResult.status}`);
      }
      const createResult = await resendRequest('/contacts', apiKey, {
        method: 'POST',
        body: JSON.stringify({ email, unsubscribed: false }),
      }, deadline);
      if (!createResult.ok) {
        throw new Error(`Contact missing (update 404), create failed with ${createResult.status}`);
      }
    }
    return redirect('/newsletter/confirmed/');
  } catch (error) {
    console.error('Newsletter confirmation failed', {
      code: 'contacts_request_failed',
      name: error instanceof Error ? error.name : 'UnknownError',
    });
    return redirect('/newsletter/error/');
  }
}

async function main(rawArgs) {
  const method = String((rawArgs.http && rawArgs.http.method) || rawArgs.__ow_method || 'post').toLowerCase();
  const args = withFormBody(rawArgs);

  if (method === 'get') {
    if (args.health) {
      const hasSendKey = !!process.env.RESEND_API_KEY;
      const hasContactsKey = !!process.env.RESEND_CONTACTS_API_KEY;
      const hasConfirmSecret = !!process.env.NEWSLETTER_CONFIRM_SECRET;
      return response(200, {
        ok: hasSendKey && hasContactsKey && hasConfirmSecret,
        hasSendKey,
        hasContactsKey,
        hasConfirmSecret,
      });
    }
    const token = String(args.token || '');
    if (!readToken(token, process.env.NEWSLETTER_CONFIRM_SECRET)) return redirect('/newsletter/error/');
    return response(200, confirmationPage(token), 'text/html; charset=utf-8');
  }
  if (method !== 'post') return response(405, { ok: false, error: 'Method not allowed.' });
  if (args.confirmation_token) return confirmSignup(String(args.confirmation_token));
  return startSignup(args);
}

exports.main = main;
exports.createToken = createToken;
exports.readToken = readToken;
exports.idempotencyKey = idempotencyKey;
exports.timeoutBudget = timeoutBudget;
exports.TOKEN_TTL_MS = TOKEN_TTL_MS;
