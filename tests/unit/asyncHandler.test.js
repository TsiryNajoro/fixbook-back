const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const asyncHandler = require('../../src/utils/asyncHandler');

describe('asyncHandler', () => {
  // The whole point: a rejected promise must reach Express' error handler
  // instead of becoming an unhandled rejection that stops the process.
  test('forwards a rejected promise to next(err)', async () => {
    const boom = new Error('boom');
    const received = [];
    await asyncHandler(async () => { throw boom; })({}, {}, (err) => received.push(err));
    assert.deepEqual(received, [boom]);
  });

  test('does not call next() when the handler succeeds', async () => {
    let nextCalled = false;
    let reached = false;
    await asyncHandler(async () => { reached = true; })({}, {}, () => { nextCalled = true; });
    assert.equal(reached, true);
    assert.equal(nextCalled, false);
  });

  test('passes req, res and next to the handler', async () => {
    const req = {};
    const res = {};
    const next = () => {};
    let args;
    await asyncHandler(async (...a) => { args = a; })(req, res, next);
    assert.deepEqual(args, [req, res, next]);
    assert.equal(args[0], req);
  });
});