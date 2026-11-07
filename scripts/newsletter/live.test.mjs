import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyLive, verifyAllLive } from './live.mjs';
import { fakeResponse, livePage } from './test-helpers.mjs';

const post = (slug = 'lloyd-kahn', title = "He Started at 65. At 91, He's Still <Teaching>") => ({
  slug, canonicalUrl: `https://concretecomeback.com/blog/${slug}/`, data: { title },
});

function recordingFetch(handler) {
  const calls = [];
  const fn = async (url, options) => { calls.push({ url: String(url), options }); return handler(String(url), options, calls.length); };
  fn.calls = calls;
  return fn;
}

test('a live page with the expected canonical and title passes, using a GET with manual redirects', async () => {
  const p = post();
  const fetchImpl = recordingFetch(() => fakeResponse({ body: livePage({ slug: p.slug, title: p.data.title }) }));
  const evidence = await verifyLive(p, { fetchImpl });
  assert.equal(evidence.status, 200);
  assert.equal(evidence.canonical, p.canonicalUrl);
  assert.equal(fetchImpl.calls.length, 1);
  assert.equal(fetchImpl.calls[0].url, p.canonicalUrl);
  assert.equal(fetchImpl.calls[0].options.method, 'GET');
  assert.equal(fetchImpl.calls[0].options.redirect, 'manual');
  assert.equal(fetchImpl.calls[0].options.body, undefined);
});

test('a same-page trailing-slash redirect is followed', async () => {
  const p = post();
  const fetchImpl = recordingFetch((url, _o, n) => n === 1
    ? fakeResponse({ status: 301, headers: { location: '/blog/lloyd-kahn' } })
    : fakeResponse({ body: livePage({ slug: p.slug, title: p.data.title }) }));
  const evidence = await verifyLive(p, { fetchImpl });
  assert.equal(evidence.hops, 1);
  assert.equal(fetchImpl.calls[1].url, 'https://concretecomeback.com/blog/lloyd-kahn');
});

test('redirects anywhere else are refused before they are fetched', async () => {
  for (const location of [
    'https://evil.example/blog/lloyd-kahn/',
    'http://concretecomeback.com/blog/lloyd-kahn/',
    'https://concretecomeback.com/blog/some-other-post/',
    'https://169.254.169.254/latest/meta-data/',
    '//evil.example/blog/lloyd-kahn/',
    'https://concretecomeback.com/blog/lloyd-kahn/?next=//evil',
    'javascript:alert(1)',
  ]) {
    const fetchImpl = recordingFetch(() => fakeResponse({ status: 302, headers: { location } }));
    await assert.rejects(verifyLive(post(), { fetchImpl }), /redirect/i, location);
    assert.equal(fetchImpl.calls.length, 1, location);
  }
});

test('a redirect without a location, or a redirect loop, fails closed', async () => {
  await assert.rejects(verifyLive(post(), { fetchImpl: recordingFetch(() => fakeResponse({ status: 301 })) }), /redirect/i);
  const loop = recordingFetch(() => fakeResponse({ status: 308, headers: { location: '/blog/lloyd-kahn/' } }));
  await assert.rejects(verifyLive(post(), { fetchImpl: loop }), /too many redirects/i);
  assert.ok(loop.calls.length <= 4);
});

test('live failures fail closed with the reason', async () => {
  const p = post();
  const cases = [
    [() => fakeResponse({ status: 404 }), /HTTP 404/],
    [() => fakeResponse({ status: 503 }), /HTTP 503/],
    [() => { throw new TypeError('fetch failed'); }, /fetch failed/],
    [() => fakeResponse({ body: '{}', headers: { 'content-type': 'application/json' } }), /content-type/i],
    [() => fakeResponse({ body: livePage({ slug: p.slug, title: p.data.title, canonical: 'https://concretecomeback.com/blog/renamed/' }) }), /canonical/i],
    [() => fakeResponse({ body: livePage({ slug: p.slug, title: p.data.title, noindex: true }) }), /noindex/i],
    [() => fakeResponse({ body: livePage({ slug: p.slug, title: 'Something else entirely' }) }), /title/i],
    [() => fakeResponse({ body: '<html><h1>x</h1></html>' }), /canonical/i],
    [() => fakeResponse({ body: 'x'.repeat(3_000_000) }), /too large/i],
  ];
  for (const [handler, pattern] of cases) {
    await assert.rejects(verifyLive(p, { fetchImpl: recordingFetch(handler) }), pattern, String(pattern));
  }
});

test('a post whose stored canonical URL is not on the site is never fetched', async () => {
  const fetchImpl = recordingFetch(() => fakeResponse());
  await assert.rejects(verifyLive({ slug: 'x', canonicalUrl: 'https://evil.example/blog/x/', data: { title: 't' } }, { fetchImpl }), /canonical/i);
  await assert.rejects(verifyLive({ slug: '../x', canonicalUrl: 'https://concretecomeback.com/blog/x/', data: { title: 't' } }, { fetchImpl }), /slug/i);
  assert.equal(fetchImpl.calls.length, 0);
});

test('verifyAllLive reports every failing post and fails the batch', async () => {
  const good = post('good-one', 'Good');
  const bad = post('bad-one', 'Bad');
  const fetchImpl = recordingFetch((url) => url.includes('good-one')
    ? fakeResponse({ body: livePage({ slug: 'good-one', title: 'Good' }) })
    : fakeResponse({ status: 404 }));
  await assert.rejects(verifyAllLive([good, bad], { fetchImpl }), (err) => {
    assert.match(err.message, /bad-one/);
    assert.doesNotMatch(err.message, /good-one:/);
    return true;
  });
});
