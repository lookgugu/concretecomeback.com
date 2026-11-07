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

async function captureResendPayload(args, options = {}) {
  const previousFetch = global.fetch;
  const previousApiKey = process.env.RESEND_API_KEY;
  const previousNotify = process.env.SUBMIT_NOTIFY_EMAIL;
  const previousConsoleError = console.error;
  let request;
  const errors = [];

  if (options.apiKey === null) delete process.env.RESEND_API_KEY;
  else process.env.RESEND_API_KEY = options.apiKey || 'test-api-key';
  if (options.notifyEmail === null) delete process.env.SUBMIT_NOTIFY_EMAIL;
  else process.env.SUBMIT_NOTIFY_EMAIL = options.notifyEmail || 'notifications@example.com';
  console.error = (...values) => errors.push(values);
  global.fetch = async (url, fetchOptions) => {
    request = { url, options: fetchOptions };
    if (options.fetchImpl) return options.fetchImpl(url, fetchOptions);
    return { ok: true };
  };

  try {
    const response = await main(args);
    return { response, request, payload: request ? JSON.parse(request.options.body) : null, errors };
  } finally {
    global.fetch = previousFetch;
    console.error = previousConsoleError;
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
  const { response, request, errors } = await captureResendPayload({
    ...BASE_ARGS,
    'listing-type': 'event',
  });

  assert.equal(response.statusCode, 303);
  assert.equal(response.headers.location, '/submit/error/');
  assert.equal(response.body, '');
  assert.equal(request, undefined);
  assert.equal(errors[0][1].code, 'invalid_listing_type');
});

test('missing required fields redirect without exposing submitted values', async () => {
  const privateValue = 'private-value@example.com';
  const { response, request, errors } = await captureResendPayload({
    ...BASE_ARGS,
    name: '',
    email: privateValue,
  });

  assert.equal(response.statusCode, 303);
  assert.equal(response.headers.location, '/submit/error/');
  assert.doesNotMatch(response.headers.location, /private-value/);
  assert.equal(request, undefined);
  assert.deepEqual(errors[0][1], {
    code: 'missing_required_fields',
    fields: ['name'],
  });
});

test('missing configuration redirects and logs setting names, not values', async () => {
  const { response, request, errors } = await captureResendPayload(BASE_ARGS, {
    apiKey: null,
    notifyEmail: null,
  });

  assert.equal(response.statusCode, 303);
  assert.equal(response.headers.location, '/submit/error/');
  assert.equal(request, undefined);
  assert.deepEqual(errors[0][1], {
    code: 'missing_configuration',
    settings: ['RESEND_API_KEY', 'SUBMIT_NOTIFY_EMAIL'],
  });
});

test('Resend API failures redirect and retain diagnostic metadata in logs', async () => {
  const { response, errors } = await captureResendPayload(BASE_ARGS, {
    fetchImpl: async () => ({
      ok: false,
      status: 503,
      text: async () => 'provider temporarily unavailable',
    }),
  });

  assert.equal(response.statusCode, 303);
  assert.equal(response.headers.location, '/submit/error/');
  assert.deepEqual(errors[0][1], {
    code: 'resend_api_error',
    status: 503,
    detail: 'provider temporarily unavailable',
  });
});

test('Resend request errors redirect and retain safe diagnostics in logs', async () => {
  const { response, errors } = await captureResendPayload(BASE_ARGS, {
    fetchImpl: async () => {
      const error = new Error('request timed out');
      error.name = 'TimeoutError';
      throw error;
    },
  });

  assert.equal(response.statusCode, 303);
  assert.equal(response.headers.location, '/submit/error/');
  assert.deepEqual(errors[0][1], {
    code: 'resend_request_failed',
    name: 'TimeoutError',
    message: 'request timed out',
  });
});

test('honeypot submissions still redirect to thanks without calling Resend', async () => {
  const { response, request } = await captureResendPayload({
    ...BASE_ARGS,
    _gotcha: 'filled-by-bot',
  });

  assert.equal(response.statusCode, 303);
  assert.equal(response.headers.location, '/submit/thanks/');
  assert.equal(request, undefined);
});
