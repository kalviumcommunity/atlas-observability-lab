// Atlas checkout service — tiny demo app for a production readiness assessment.
const express = require('express');
const client = require('prom-client');
const crypto = require('crypto');

const app = express();
const PORT = 8080;

// Prometheus metrics
const register = new client.Registry();
client.collectDefaultMetrics({ register });

const requestCounter = new client.Counter({
  name: 'checkout_requests_total',
  help: 'Total checkout requests by status',
  labelNames: ['status'],
  registers: [register],
});

// Simulates a call to a downstream payments provider.
// Set FORCE_DEP_DOWN=1 to simulate the dependency being unavailable.
function checkPayments() {
  if (process.env.FORCE_DEP_DOWN === '1') {
    return { ok: false, reason: 'payments provider unreachable' };
  }
  return { ok: true };
}

function logLine(fields) {
  console.log(JSON.stringify(fields));
}

app.get('/', (req, res) => {
  res.status(200).send('Atlas checkout is running');
});

app.get('/checkout', (req, res) => {
  const requestId = crypto.randomUUID();
  const dep = checkPayments();

  if (!dep.ok) {
    requestCounter.inc({ status: 'error' });
    // NOTE: this line is logged as a normal request, not flagged as an error,
    // and does not carry a request_id — so it can't be traced later.
    logLine({
      timestamp: new Date().toISOString(),
      message: `checkout failed: ${dep.reason}`,
    });
    res.status(502).json({ error: 'payment_failed' });
    return;
  }

  requestCounter.inc({ status: 'success' });
  logLine({
    timestamp: new Date().toISOString(),
    level: 'info',
    request_id: requestId,
    message: 'checkout succeeded',
  });
  res.status(200).json({ status: 'ok' });
});

app.get('/health', (req, res) => {
  // NOTE: always reports healthy, regardless of downstream dependency state.
  res.status(200).json({ status: 'ok' });
});

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

app.listen(PORT, () => {
  logLine({
    timestamp: new Date().toISOString(),
    level: 'info',
    request_id: 'startup',
    message: `Atlas checkout listening on port ${PORT}`,
  });
});
