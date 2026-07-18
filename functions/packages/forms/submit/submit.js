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

function redirect(location) {
  return { statusCode: 303, headers: { location }, body: '' };
}

function errorPage(message) {
  return {
    statusCode: 502,
    headers: { 'content-type': 'text/html; charset=utf-8' },
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

async function main(args) {
  // DO's current runtime exposes the verb as args.http.method; __ow_method is legacy.
  const method = String((args.http && args.http.method) || args.__ow_method || 'post');
  if (method.toLowerCase() !== 'post') {
    return redirect('/submit/');
  }

  // Honeypot: bots fill the hidden field; pretend success and drop it.
  if (args._gotcha) {
    return redirect('/submit/thanks/');
  }

  const missing = REQUIRED.filter((key) => !String(args[key] || '').trim());
  if (missing.length > 0) {
    return errorPage(`Some required fields were missing: ${missing.join(', ')}.`);
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

  // Invalid reply-to would fail the whole Resend request; the raw value is
  // still included in the email body either way.
  const submitterEmail = String(args.email || '').trim();
  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(submitterEmail);

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
