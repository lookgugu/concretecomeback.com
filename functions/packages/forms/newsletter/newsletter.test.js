const test = require('node:test');
const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');
const { main, createToken, readToken, idempotencyKey, timeoutBudget, TOKEN_TTL_MS } = require('./newsletter');

const ENV_KEYS = ['RESEND_API_KEY', 'RESEND_CONTACTS_API_KEY', 'NEWSLETTER_CONFIRM_SECRET'];

async function withEnvironment(fetchImpl, callback) {
  const previousFetch = global.fetch;
  const previous = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  process.env.RESEND_API_KEY = 'send-key';
  process.env.RESEND_CONTACTS_API_KEY = 'contacts-key';
  process.env.NEWSLETTER_CONFIRM_SECRET = 'a-long-random-test-secret';
  global.fetch = fetchImpl;
  try { return await callback(); }
  finally {
    global.fetch = previousFetch;
    for (const key of ENV_KEYS) previous[key] === undefined ? delete process.env[key] : process.env[key] = previous[key];
  }
}

async function captureWarnings(callback) {
  const warnings = [];
  const original = console.warn;
  console.warn = (...args) => warnings.push(args);
  try { await callback(); } finally { console.warn = original; }
  return warnings;
}

test('signup sends a confirmation email without creating a contact', async () => {
  const requests = [];
  await withEnvironment(async (url, options) => {
    requests.push({ url, options });
    return { ok: true, status: 200 };
  }, async () => {
    const result = await main({ http: { method: 'POST' }, email: 'Skater@Example.com', consent: 'yes' });
    assert.equal(result.statusCode, 202);
    assert.deepEqual(JSON.parse(result.body), { ok: true, status: 'pending' });
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, 'https://api.resend.com/emails');
    const payload = JSON.parse(requests[0].options.body);
    assert.deepEqual(payload.to, ['skater@example.com']);
    assert.match(payload.text, /api\/forms\/newsletter\?token=/);
    assert.match(requests[0].options.headers['Idempotency-Key'], /^newsletter-confirmation\/[A-Za-z0-9_-]+$/);
  });
});

test('repeated signup shares one idempotency key, reports pending, and logs the suppression', async () => {
  const requests = [];
  const warnings = await captureWarnings(() => withEnvironment(async (url, options) => {
    requests.push({ url, options });
    return requests.length === 1 ? { ok: true, status: 200 } : { ok: false, status: 409 };
  }, async () => {
    const first = await main({ http: { method: 'POST' }, email: 'Skater@Example.com', consent: 'yes' });
    const repeated = await main({ http: { method: 'POST' }, email: 'skater@example.com', consent: 'yes' });

    assert.equal(first.statusCode, 202);
    assert.equal(repeated.statusCode, 202);
    assert.deepEqual(JSON.parse(repeated.body), { ok: true, status: 'pending' });
    assert.equal(requests.length, 2);
    assert.equal(
      requests[0].options.headers['Idempotency-Key'],
      requests[1].options.headers['Idempotency-Key'],
    );
  }));

  // The visitor is told "check your inbox" either way; the log line is the only
  // evidence that no second email went out.
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0][1].code, 'confirmation_email_suppressed');
  assert.doesNotMatch(JSON.stringify(warnings), /skater@example\.com/);
});

test('the idempotency key is stable within a token lifetime and rotates after it', () => {
  const secret = 'test-secret';
  const start = 7 * TOKEN_TTL_MS + 1_000;
  assert.equal(idempotencyKey('skater@example.com', secret, start), idempotencyKey('skater@example.com', secret, start + 60_000));
  assert.notEqual(idempotencyKey('skater@example.com', secret, start), idempotencyKey('skater@example.com', secret, start + TOKEN_TTL_MS));
  assert.notEqual(idempotencyKey('skater@example.com', secret, start), idempotencyKey('other@example.com', secret, start));
});

// The browser posts through fetch, and DO only parses JSON and form-urlencoded
// bodies into `args`. Anything else arrives base64-encoded in `__ow_body`, so the
// encoded-body path is the one real visitors exercise.
test('a urlencoded request body posted by the browser reaches the function', async () => {
  const requests = [];
  await withEnvironment(async (url, options) => {
    requests.push({ url, options });
    return { ok: true, status: 200 };
  }, async () => {
    const body = new URLSearchParams({ _gotcha: '', consent: 'yes', email: 'Skater@Example.com' });
    const result = await main({
      http: { method: 'POST' },
      __ow_body: Buffer.from(body.toString(), 'utf8').toString('base64'),
    });

    assert.equal(result.statusCode, 202);
    assert.equal(requests.length, 1);
    assert.deepEqual(JSON.parse(requests[0].options.body).to, ['skater@example.com']);
  });
});

test('an unencoded urlencoded body is decoded too', async () => {
  const requests = [];
  await withEnvironment(async (url, options) => {
    requests.push({ url, options });
    return { ok: true, status: 200 };
  }, async () => {
    const result = await main({
      http: { method: 'POST' },
      __ow_isBase64Encoded: false,
      __ow_body: 'consent=yes&email=skater%40example.com',
    });

    assert.equal(result.statusCode, 202);
    assert.equal(requests.length, 1);
  });
});

test('confirmation link renders an explicit confirmation form', async () => {
  await withEnvironment(async () => ({ ok: true, status: 200 }), async () => {
    const token = createToken('skater@example.com', process.env.NEWSLETTER_CONFIRM_SECRET);
    const result = await main({ http: { method: 'GET' }, token });
    assert.equal(result.statusCode, 200);
    assert.match(result.headers['content-type'], /text\/html/);
    assert.match(result.body, /Confirm my subscription/);
    assert.match(result.body, /name="confirmation_token"/);
  });
});

test('health check reports all newsletter configuration without making an outbound call', async () => {
  let calls = 0;
  await withEnvironment(async () => { calls += 1; return { ok: true, status: 200 }; }, async () => {
    const result = await main({ http: { method: 'GET' }, health: '1' });
    assert.deepEqual(JSON.parse(result.body), {
      ok: true,
      hasSendKey: true,
      hasContactsKey: true,
      hasConfirmSecret: true,
    });
    assert.equal(calls, 0);
  });
});

test('confirming reactivates an existing contact with a single update', async () => {
  const requests = [];
  await withEnvironment(async (url, options) => {
    requests.push({ url, options });
    return { ok: true, status: 200 };
  }, async () => {
    const token = createToken('returning@example.com', process.env.NEWSLETTER_CONFIRM_SECRET);
    const result = await main({ http: { method: 'POST' }, confirmation_token: token });
    assert.equal(result.headers.location, '/newsletter/confirmed/');
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, 'https://api.resend.com/contacts/returning%40example.com');
    assert.equal(requests[0].options.method, 'PATCH');
    assert.deepEqual(JSON.parse(requests[0].options.body), { unsubscribed: false });
    assert.ok(requests[0].options.signal instanceof AbortSignal);
  });
});

test('confirming a new address creates the contact only after the update reports 404', async () => {
  const requests = [];
  await withEnvironment(async (url, options) => {
    requests.push({ url, options });
    return requests.length === 1 ? { ok: false, status: 404 } : { ok: true, status: 201 };
  }, async () => {
    const token = createToken('skater@example.com', process.env.NEWSLETTER_CONFIRM_SECRET);
    const result = await main({ http: { method: 'POST' }, confirmation_token: token });
    assert.equal(result.headers.location, '/newsletter/confirmed/');
    assert.equal(requests.length, 2);
    assert.equal(requests[0].options.method, 'PATCH');
    assert.equal(requests[1].url, 'https://api.resend.com/contacts');
    assert.equal(requests[1].options.method, 'POST');
    assert.deepEqual(JSON.parse(requests[1].options.body), { email: 'skater@example.com', unsubscribed: false });
    assert.ok(requests[1].options.signal instanceof AbortSignal);
  });
});

test('an update failure other than 404 lands on the error page without attempting a create', async () => {
  const requests = [];
  await withEnvironment(async (url, options) => {
    requests.push({ url, options });
    return { ok: false, status: 401 };
  }, async () => {
    const token = createToken('skater@example.com', process.env.NEWSLETTER_CONFIRM_SECRET);
    const result = await main({ http: { method: 'POST' }, confirmation_token: token });
    assert.equal(result.headers.location, '/newsletter/error/');
    assert.equal(requests.length, 1);
  });
});

test('a confirmation whose update reports 404 and whose create fails lands on the error page', async () => {
  const requests = [];
  await withEnvironment(async (url, options) => {
    requests.push({ url, options });
    return requests.length === 1 ? { ok: false, status: 404 } : { ok: false, status: 500 };
  }, async () => {
    const token = createToken('broken@example.com', process.env.NEWSLETTER_CONFIRM_SECRET);
    const result = await main({ http: { method: 'POST' }, confirmation_token: token });
    assert.equal(result.headers.location, '/newsletter/error/');
    assert.equal(requests.length, 2);
  });
});

test('each Resend call in a confirmation draws on one shared budget', () => {
  assert.equal(timeoutBudget(undefined), 8000);
  assert.equal(timeoutBudget(50_000, 45_000), 5_000);
  // An exhausted budget still gets a floor, so the call fails fast instead of hanging.
  assert.equal(timeoutBudget(50_000, 50_500), 1_000);
});

test('invalid consent and bot submissions do not call Resend', async () => {
  let calls = 0;
  await withEnvironment(async () => { calls += 1; return { ok: true, status: 200 }; }, async () => {
    const invalid = await main({ http: { method: 'POST' }, email: 'skater@example.com' });
    const bot = await main({ http: { method: 'POST' }, email: 'bot@example.com', consent: 'yes', _gotcha: 'filled' });
    assert.equal(invalid.statusCode, 400);
    assert.equal(bot.statusCode, 202);
    assert.equal(calls, 0);
  });
});

test('tampered and expired tokens are rejected', () => {
  const secret = 'test-secret';
  const valid = createToken('skater@example.com', secret, 1_000);
  assert.equal(readToken(`${valid}x`, secret, 2_000), null);
  assert.equal(readToken(valid, secret, 1_000 + TOKEN_TTL_MS - 1), 'skater@example.com');
  assert.equal(readToken(valid, secret, 1_000 + TOKEN_TTL_MS), null);
});

test('a signed payload without an expiry is rejected rather than living forever', () => {
  const secret = 'test-secret';
  const payload = Buffer.from(JSON.stringify({ email: 'skater@example.com' })).toString('base64url');
  const signature = createHmac('sha256', secret).update(payload).digest('base64url');
  assert.equal(readToken(`${payload}.${signature}`, secret, 2_000), null);
});
