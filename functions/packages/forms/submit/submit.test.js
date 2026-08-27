const test = require('node:test');
const assert = require('node:assert/strict');
const { main } = require('./submit');

const BASE_ARGS = {
  'listing-type': 'park',
  name: 'Flow Validation Park',
  city: 'Cambridge',
  country: 'US',
  description: 'A synthetic listing used to test the submission function.',
  http: { method: 'POST' },
};

async function captureResendPayload(args) {
  const previousFetch = global.fetch;
  const previousApiKey = process.env.RESEND_API_KEY;
  const previousNotify = process.env.SUBMIT_NOTIFY_EMAIL;
  let request;

  process.env.RESEND_API_KEY = 'test-api-key';
  process.env.SUBMIT_NOTIFY_EMAIL = 'notifications@example.com';
  global.fetch = async (url, options) => {
    request = { url, options };
    return { ok: true };
  };

  try {
    const response = await main(args);
    return { response, request, payload: request ? JSON.parse(request.options.body) : null };
  } finally {
    global.fetch = previousFetch;
    if (previousApiKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = previousApiKey;
    if (previousNotify === undefined) delete process.env.SUBMIT_NOTIFY_EMAIL;
    else process.env.SUBMIT_NOTIFY_EMAIL = previousNotify;
  }
}

test('park submissions include park fields and omit stale shop/group fields', async () => {
  const { response, payload } = await captureResendPayload({
    ...BASE_ARGS,
    difficulty: 'beginner-friendly',
    'adult-friendly': 'yes',
    'entry-fee': 'Free',
    instagram: '@stale-shop-value',
    'age-range': 'stale group value',
  });

  assert.equal(response.statusCode, 303);
  assert.equal(response.headers.location, '/submit/thanks/');
  assert.match(payload.text, /Difficulty: beginner-friendly/);
  assert.match(payload.text, /Welcoming to older skaters: yes/);
  assert.doesNotMatch(payload.text, /stale-shop-value/);
  assert.doesNotMatch(payload.text, /stale group value/);
});

test('shop submissions omit stale park and group fields', async () => {
  const { payload } = await captureResendPayload({
    ...BASE_ARGS,
    'listing-type': 'shop',
    instagram: '@older-skaters-shop',
    'adult-advice': 'yes',
    difficulty: 'advanced',
    'entry-fee': '$10',
    'meet-frequency': 'stale group value',
  });

  assert.match(payload.text, /Instagram: @older-skaters-shop/);
  assert.match(payload.text, /Advice for older skaters offered: yes/);
  assert.doesNotMatch(payload.text, /Difficulty:/);
  assert.doesNotMatch(payload.text, /Entry fee:/);
  assert.doesNotMatch(payload.text, /stale group value/);
});

test('group submissions omit stale park and shop fields', async () => {
  const { payload } = await captureResendPayload({
    ...BASE_ARGS,
    'listing-type': 'group',
    'age-range': 'Older skaters',
    'meet-frequency': 'Every Sunday',
    'is-online': 'yes',
    difficulty: 'advanced',
    instagram: '@stale-shop-value',
  });

  assert.match(payload.text, /Age range: Older skaters/);
  assert.match(payload.text, /Meeting schedule: Every Sunday/);
  assert.match(payload.text, /Online-only: yes/);
  assert.doesNotMatch(payload.text, /Difficulty:/);
  assert.doesNotMatch(payload.text, /stale-shop-value/);
});

test('unsupported listing types are rejected before calling Resend', async () => {
  const { response, request } = await captureResendPayload({
    ...BASE_ARGS,
    'listing-type': 'event',
  });

  assert.equal(response.statusCode, 502);
  assert.equal(request, undefined);
  assert.match(response.body, /listing type was not recognized/);
});
