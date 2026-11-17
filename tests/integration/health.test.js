const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const app = require('../../app');
const { useTestDatabase } = require('../helpers/db');

useTestDatabase();

describe('GET /api/health', () => {
  // Used by monitoring and by Kubernetes probes: it must answer without a token.
  test('answers 200 with ok: true and the service name, without authentication', async () => {
    const res = await request(app).get('/api/health');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { ok: true, service: 'fixbook-backend' });
  });
});