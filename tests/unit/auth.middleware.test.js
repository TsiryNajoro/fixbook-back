const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const User = require('../../src/models/User');
const { requireAuth, signToken } = require('../../src/middleware/auth');

// Minimal fake of Express's res: records the status code and JSON body.
function fakeRes() {
  return {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
}

// Runs the middleware and reports whether next() was called.
async function run(headers) {
  const req = { headers };
  const res = fakeRes();
  let nextCalled = false;
  await requireAuth(req, res, () => { nextCalled = true; });
  return { req, res, nextCalled };
}

describe('requireAuth middleware', () => {
  // The first line of defence: no credentials, no access.
  test('rejects a request without Authorization header (401)', async () => {
    const { res, nextCalled } = await run({});
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.error, 'Missing auth token');
    assert.equal(nextCalled, false);
  });

  test('rejects an Authorization header without the Bearer prefix (401)', async () => {
    const { res, nextCalled } = await run({ authorization: 'sometoken' });
    assert.equal(res.statusCode, 401);
    assert.equal(nextCalled, false);
  });

  test('rejects a malformed token (401)', async () => {
    const { res, nextCalled } = await run({ authorization: 'Bearer not-a-jwt' });
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.error, 'Invalid or expired token');
    assert.equal(nextCalled, false);
  });

  // A forged token (signed with another secret) must never be accepted.
  // The user EXISTS in this test: if the signature were not verified, the
  // request would go through, so only a real signature check can make it fail.
  test('rejects a token signed with another secret (401)', async (t) => {
    const user = { _id: new mongoose.Types.ObjectId(), company: new mongoose.Types.ObjectId() };
    const findById = t.mock.method(User, 'findById', async () => user);
    const forged = jwt.sign({ sub: user._id.toString() }, 'another-secret');

    const { res, nextCalled } = await run({ authorization: `Bearer ${forged}` });

    assert.equal(res.statusCode, 401);
    assert.equal(nextCalled, false);
    assert.equal(findById.mock.callCount(), 0); // rejected before any database lookup
  });

  // Same idea for an expired token of an existing user.
  test('rejects an expired token (401)', async (t) => {
    const user = { _id: new mongoose.Types.ObjectId(), company: new mongoose.Types.ObjectId() };
    const findById = t.mock.method(User, 'findById', async () => user);
    const expired = jwt.sign({ sub: user._id.toString() }, process.env.JWT_SECRET, { expiresIn: -60 });

    const { res, nextCalled } = await run({ authorization: `Bearer ${expired}` });

    assert.equal(res.statusCode, 401);
    assert.equal(nextCalled, false);
    assert.equal(findById.mock.callCount(), 0);
  });

  // A valid token for a user deleted since: the token alone is not enough.
  test('rejects a valid token whose user no longer exists (401)', async (t) => {
    t.mock.method(User, 'findById', async () => null);
    const token = signToken({ _id: new mongoose.Types.ObjectId(), company: new mongoose.Types.ObjectId() });
    const { res, nextCalled } = await run({ authorization: `Bearer ${token}` });
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.error, 'User not found');
    assert.equal(nextCalled, false);
  });

  // This is what enforces tenant isolation: req.companyId comes from the
  // database user, never from the client.
  test('accepts a valid token: calls next() and sets req.user and req.companyId', async (t) => {
    const user = { _id: new mongoose.Types.ObjectId(), company: new mongoose.Types.ObjectId() };
    const findById = t.mock.method(User, 'findById', async () => user);
    const token = signToken(user);

    const { req, res, nextCalled } = await run({ authorization: `Bearer ${token}` });

    assert.equal(nextCalled, true);
    assert.equal(res.statusCode, null);
    assert.equal(req.user, user);
    assert.equal(req.companyId, user.company);
    assert.equal(findById.mock.callCount(), 1);
    assert.equal(findById.mock.calls[0].arguments[0], user._id.toString());
  });
});

describe('signToken', () => {
  test('creates a token carrying the user id and company, verifiable with the secret', () => {
    const user = { _id: new mongoose.Types.ObjectId(), company: new mongoose.Types.ObjectId() };
    const payload = jwt.verify(signToken(user), process.env.JWT_SECRET);
    assert.equal(payload.sub, user._id.toString());
    assert.equal(payload.company, user.company.toString());
    assert.ok(payload.exp > payload.iat);
  });
});