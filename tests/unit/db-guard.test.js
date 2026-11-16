const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { getTestDatabaseName } = require('../helpers/guard');

describe('test database guard', () => {
  // Without MONGO_URI, a fallback could point to the development database.
  test('refuses when MONGO_URI is missing', () => {
    assert.throws(() => getTestDatabaseName(null), /MONGO_URI is required/);
    assert.throws(() => getTestDatabaseName(''), /MONGO_URI is required/);
  });

  // With no argument, the guard reads MONGO_URI from the environment (the real usage).
  test('reads MONGO_URI from the environment when no argument is given', (t) => {
    const saved = process.env.MONGO_URI;
    t.after(() => {
      if (saved === undefined) delete process.env.MONGO_URI;
      else process.env.MONGO_URI = saved;
    });
    delete process.env.MONGO_URI;
    assert.throws(() => getTestDatabaseName(), /MONGO_URI is required/);
    process.env.MONGO_URI = 'mongodb://h/fixbook_test';
    assert.equal(getTestDatabaseName(), 'fixbook_test');
    process.env.MONGO_URI = 'mongodb://h/fixbook';
    assert.throws(() => getTestDatabaseName(), /not a test database/);
  });
  
  // The whole point of the guard: never wipe the development database.
  test('refuses the development database', () => {
    assert.throws(() => getTestDatabaseName('mongodb://127.0.0.1:27017/fixbook'), /not a test database/);
  });

  test('refuses a URI without a database name', () => {
    assert.throws(() => getTestDatabaseName('mongodb://127.0.0.1:27017'), /not a test database/);
  });

  // "test" must be a whole word: "latest" or "fixbook_testing" are not test databases.
  test('refuses names where "test" is only part of a word', () => {
    assert.throws(() => getTestDatabaseName('mongodb://h/latest'), /not a test database/);
    assert.throws(() => getTestDatabaseName('mongodb://h/fixbook_testing'), /not a test database/);
  });

  test('accepts dedicated test databases', () => {
    assert.equal(getTestDatabaseName('mongodb://127.0.0.1:27018/fixbook_test'), 'fixbook_test');
    assert.equal(getTestDatabaseName('mongodb://ci-mongo-x:27017/fixbook_test'), 'fixbook_test');
    assert.equal(getTestDatabaseName('mongodb://h/ci-test'), 'ci-test');
    assert.equal(getTestDatabaseName('mongodb://u:p@h:27017/test?authSource=admin'), 'test');
  });

  // Error messages end up in CI logs: they must never contain credentials.
  test('never leaks credentials in the error message', () => {
    const fakePassword = 'not-' + 'a-real-password'; // built in two parts so secret scanners ignore it
    const uri = `mongodb://admin:${fakePassword}@h:27017/fixbook`;
    assert.throws(() => getTestDatabaseName(uri), (err) => !err.message.includes(fakePassword));
  });
});