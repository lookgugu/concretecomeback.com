const test = require('node:test');
const assert = require('node:assert/strict');
const { main, createToken, readToken } = require('./newsletter');

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

test('repeated signup uses one per-address idempotency key and treats suppression as pending', async () => {
  const requests = [];
  await withEnvironment(async (url, options) => {
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

test('confirmed signup creates an active Resend contact', async () => {
  const requests = [];
  await withEnvironment(async (url, options) => {
    requests.push({ url, options });
    return { ok: true, status: 201 };
  }, async () => {
    const token = createToken('skater@example.com', process.env.NEWSLETTER_CONFIRM_SECRET);
    const result = await main({ http: { method: 'POST' }, confirmation_token: token });
    assert.equal(result.headers.location, '/newsletter/confirmed/');
    assert.equal(requests[0].url, 'https://api.resend.com/contacts');
    assert.deepEqual(JSON.parse(requests[0].options.body), { email: 'skater@example.com', unsubscribed: false });
  });
});

test('a previously existing contact is resubscribed only after confirmation', async () => {
  const requests = [];
  await withEnvironment(async (url, options) => {
    requests.push({ url, options });
    return requests.length === 1 ? { ok: false, status: 409 } : { ok: true, status: 200 };
  }, async () => {
    const token = createToken('returning@example.com', process.env.NEWSLETTER_CONFIRM_SECRET);
    const result = await main({ http: { method: 'POST' }, confirmation_token: token });
    assert.equal(result.headers.location, '/newsletter/confirmed/');
    assert.equal(requests[1].url, 'https://api.resend.com/contacts/returning%40example.com');
    assert.equal(requests[1].options.method, 'PATCH');
  });
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
  assert.equal(readToken(valid, secret, 1_000 + 24 * 60 * 60 * 1000 + 1), null);
});
