const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const User = require('../../src/models/User');
const Company = require('../../src/models/Company');
const Problem = require('../../src/models/Problem');
const Notification = require('../../src/models/Notification');

const id = () => new mongoose.Types.ObjectId();

// validate() checks the schema rules in memory: no database connection needed.
async function errorPaths(doc) {
  try {
    await doc.validate();
    return [];
  } catch (err) {
    return Object.keys(err.errors);
  }
}

describe('User model', () => {
  test('requires company, name and email', async () => {
    const paths = await errorPaths(new User({}));
    assert.deepEqual(paths.sort(), ['company', 'email', 'name']);
  });

  test('accepts a valid user', async () => {
    assert.deepEqual(await errorPaths(new User({ company: id(), name: 'Ana', email: 'ana@acme.com' })), []);
  });

  // Emails are compared case-insensitively by the routes: the schema must normalise them.
  test('lowercases and trims the email', () => {
    const user = new User({ company: id(), name: 'Ana', email: '  Ana@ACME.com ' });
    assert.equal(user.email, 'ana@acme.com');
  });

  // Never store a password in clear text.
  test('setPassword stores a bcrypt hash, never the plain password', async () => {
    const user = new User({ company: id(), name: 'Ana', email: 'ana@acme.com' });
    await user.setPassword('Secret-for-tests-1');
    assert.notEqual(user.passwordHash, 'Secret-for-tests-1');
    assert.match(user.passwordHash, /^\$2[aby]\$10\$/);
  });

  test('checkPassword returns true for the right password and false otherwise', async () => {
    const user = new User({ company: id(), name: 'Ana', email: 'ana@acme.com' });
    await user.setPassword('Secret-for-tests-1');
    assert.equal(await user.checkPassword('Secret-for-tests-1'), true);
    assert.equal(await user.checkPassword('wrong'), false);
  });

  // OAuth-only accounts have no hash: they must never be loggable with a password.
  test('checkPassword returns false when the user has no password hash', async () => {
    const user = new User({ company: id(), name: 'Ana', email: 'ana@acme.com' });
    assert.equal(await user.checkPassword('anything'), false);
  });

  // toSafeJSON is what the API returns: it must not leak the hash.
  test('toSafeJSON exposes only safe fields', async () => {
    const user = new User({ company: id(), name: 'Ana', email: 'ana@acme.com', googleId: 'g-1' });
    await user.setPassword('Secret-for-tests-1');
    const safe = user.toSafeJSON();
    assert.deepEqual(Object.keys(safe).sort(), ['avatarUrl', 'company', 'department', 'email', 'id', 'name']);
    assert.equal(JSON.stringify(safe).includes(user.passwordHash), false);
    assert.equal('googleId' in safe, false);
  });
});

describe('Company model', () => {
  test('requires name and domain', async () => {
    assert.deepEqual((await errorPaths(new Company({}))).sort(), ['domain', 'name']);
  });

  // The domain is the tenant key: "ACME.com " and "acme.com" must be the same tenant.
  test('lowercases and trims the domain', () => {
    assert.equal(new Company({ name: 'Acme', domain: ' ACME.com ' }).domain, 'acme.com');
  });

  test('has default categories', () => {
    const company = new Company({ name: 'Acme', domain: 'acme.com' });
    assert.ok(company.categories.length > 0);
    assert.ok(company.categories.includes('Backend'));
  });
});

describe('Notification model', () => {
  const valid = () => ({ company: id(), recipient: id(), problem: id(), message: 'hello' });

  test('requires company, recipient, problem and message', async () => {
    assert.deepEqual((await errorPaths(new Notification({}))).sort(), ['company', 'message', 'problem', 'recipient']);
  });

  test('defaults to type "validation" and unread', () => {
    const n = new Notification(valid());
    assert.equal(n.type, 'validation');
    assert.equal(n.read, false);
  });

  test('accepts "comment" and rejects any other type', async () => {
    assert.deepEqual(await errorPaths(new Notification({ ...valid(), type: 'comment' })), []);
    assert.deepEqual(await errorPaths(new Notification({ ...valid(), type: 'spam' })), ['type']);
  });
});

describe('Problem model', () => {
  test('requires company and author only (drafts may be empty)', async () => {
    assert.deepEqual((await errorPaths(new Problem({}))).sort(), ['author', 'company']);
  });

  test('applies default values', () => {
    const p = new Problem({ company: id(), author: id() });
    assert.equal(p.category, 'N/A');
    assert.equal(p.isDraft, false);
    assert.equal(p.archivedAt, null);
    assert.deepEqual([...p.tags], []);
    assert.deepEqual([...p.comments], []);
    assert.deepEqual([...p.solution.validations], []);
  });

  // A validation is an identity-stamped confirmation, not an anonymous upvote.
  test('a validation requires validator, validatorName and department', async () => {
    const p = new Problem({ company: id(), author: id(), solution: { validations: [{}] } });
    assert.deepEqual((await errorPaths(p)).sort(), [
      'solution.validations.0.department',
      'solution.validations.0.validator',
      'solution.validations.0.validatorName',
    ]);
  });

  test('a comment requires author, authorName and text', async () => {
    const p = new Problem({ company: id(), author: id(), comments: [{}] });
    assert.deepEqual((await errorPaths(p)).sort(), [
      'comments.0.author',
      'comments.0.authorName',
      'comments.0.text',
    ]);
  });

  test('accepts a complete validation and a complete comment', async () => {
    const p = new Problem({
      company: id(),
      author: id(),
      solution: { validations: [{ validator: id(), validatorName: 'Ana', department: 'DevOps' }] },
      comments: [{ author: id(), authorName: 'Ana', text: 'thanks' }],
    });
    assert.deepEqual(await errorPaths(p), []);
  });
});