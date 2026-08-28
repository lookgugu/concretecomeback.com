const { createHmac, timingSafeEqual } = require('node:crypto');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
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
    if (!EMAIL_RE.test(email) || email.length > 254 || Number(parsed.expires) < now) return null;
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

async function resendRequest(path, apiKey, options) {
  return fetch(`https://api.resend.com${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    signal: AbortSignal.timeout(8000),
  });
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
  // Resend retains idempotency keys for 24 hours. Hash the normalized address so
  // retries cannot expose it in provider logs while still sharing one cooldown.
  const idempotencyKey = `newsletter-confirmation/${sign(email, secret)}`;

  try {
    const result = await resendRequest('/emails', apiKey, {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'Idempotency-Key': idempotencyKey },
    });
    // A reused or concurrent key means Resend suppressed the duplicate send.
    // Keep the public response indistinguishable from the initial request.
    if (result.status === 409) return response(202, { ok: true, status: 'pending' });
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

  try {
    const createResult = await resendRequest('/contacts', apiKey, {
      method: 'POST',
      body: JSON.stringify({ email, unsubscribed: false }),
    });
    if (createResult.status === 409) {
      const updateResult = await resendRequest(`/contacts/${encodeURIComponent(email)}`, apiKey, {
        method: 'PATCH',
        body: JSON.stringify({ unsubscribed: false }),
      });
      if (!updateResult.ok) throw new Error(`Contact update failed with ${updateResult.status}`);
    } else if (!createResult.ok) {
      throw new Error(`Contact creation failed with ${createResult.status}`);
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
