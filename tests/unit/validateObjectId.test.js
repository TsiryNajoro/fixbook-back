const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const validateObjectIdParam = require('../../src/middleware/validateObjectId');

function run(value) {
  const res = {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
  let nextCalled = false;
  validateObjectIdParam({}, res, () => { nextCalled = true; }, value);
  return { res, nextCalled };
}

describe('validateObjectIdParam', () => {
  test('lets a valid 24-character hexadecimal id through', () => {
    for (const id of ['507f1f77bcf86cd799439011', '507F1F77BCF86CD799439011']) {
      const { res, nextCalled } = run(id);
      assert.equal(nextCalled, true, id);
      assert.equal(res.statusCode, null);
    }
  });

  // Each of these would make Mongoose throw a CastError.
  test('refuses malformed ids with a 400', () => {
    const bad = [
      'abc',
      '',
      '507f1f77bcf86cd79943901',    // 23 characters
      '507f1f77bcf86cd7994390111',  // 25 characters
      '507f1f77bcf86cd79943901g',   // non-hexadecimal character
      'abcdefghijkl',               // 12 characters
      '{"$ne":null}',
    ];
    for (const id of bad) {
      const { res, nextCalled } = run(id);
      assert.equal(res.statusCode, 400, JSON.stringify(id));
      assert.deepEqual(res.body, { error: 'Invalid id' });
      assert.equal(nextCalled, false);
    }
  });
});