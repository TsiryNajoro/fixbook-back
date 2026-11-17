const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../app');
const User = require('../../src/models/User');
const Company = require('../../src/models/Company');
const { useTestDatabase } = require('../helpers/db');

useTestDatabase();

const PASSWORD = 'test-password-1';

const payload = (overrides = {}) => ({
  name: 'Ana',
  email: 'ana@acme.com',
  password: PASSWORD,
  companyName: 'Acme',
  department: 'DevOps',
  ...overrides,
});

const register = (overrides) => request(app).post('/api/auth/register').send(payload(overrides));
const login = (body) => request(app).post('/api/auth/login').send(body);

describe('POST /api/auth/register', () => {
  test('creates the account and answers 201 with a token and a safe user', async () => {
    const res = await register();
    assert.equal(res.status, 201);
    assert.ok(res.body.token);
    assert.equal(res.body.user.email, 'ana@acme.com');
    assert.equal(res.body.user.name, 'Ana');
    assert.equal('passwordHash' in res.body.user, false);
    assert.equal(JSON.stringify(res.body).includes('$2'), false); // no bcrypt hash anywhere in the response
  });

  // The password must be hashed in the database, never stored as received.
  test('stores a hashed password, not the plain one', async () => {
    await register();
    const user = await User.findOne({ email: 'ana@acme.com' }).select('+passwordHash');
    assert.notEqual(user.passwordHash, PASSWORD);
    assert.equal(await user.checkPassword(PASSWORD), true);
  });

  // Multi-tenancy: the email domain decides the company.
  test('creates the company from the email domain, and reuses it for a colleague', async () => {
    const first = await register();
    const second = await register({ name: 'Bob', email: 'bob@acme.com' });
    assert.equal(second.status, 201);
    assert.equal(await Company.countDocuments(), 1);
    const company = await Company.findOne({ domain: 'acme.com' });
    assert.equal(company.name, 'Acme');
    assert.equal(first.body.user.company, second.body.user.company);
  });

  test('refuses missing fields (400)', async () => {
    for (const field of ['name', 'email', 'password', 'companyName']) {
      const res = await register({ [field]: undefined });
      assert.equal(res.status, 400, `missing ${field}`);
    }
    assert.equal(await User.countDocuments(), 0);
  });

  test('refuses an email without a domain (400)', async () => {
    const res = await register({ email: 'not-an-email' });
    assert.equal(res.status, 400);
    assert.equal(await User.countDocuments(), 0);
  });

  // Duplicate email: clean 409, no crash, and nothing created twice.
  test('refuses a duplicate email with a clean 409', async () => {
    await register();
    const res = await register();
    assert.equal(res.status, 409);
    assert.match(res.body.error, /already exists/);
    assert.equal(await User.countDocuments(), 1);
  });

  test('treats emails case-insensitively (duplicate detected)', async () => {
    await register();
    const res = await register({ email: 'ANA@Acme.com' });
    assert.equal(res.status, 409);
    assert.equal(await User.countDocuments(), 1);
  });

  // NoSQL injection on register: an object instead of a string.
  test('NoSQL injection in email does not create an account', async () => {
    const res = await register({ email: { $ne: null } });
    assert.notEqual(res.status, 201);
    assert.equal(res.body.token, undefined);
    assert.equal(await User.countDocuments(), 0);
  });

  test('NoSQL injection in email is rejected with a clean 400', async () => {
    const res = await register({ email: { $ne: null } });
    assert.equal(res.status, 400);
  });

  test('NoSQL injection in password is rejected with a clean 400', async () => {
    const res = await register({ password: { $ne: null } });
    assert.equal(res.status, 400);
  });
});

describe('POST /api/auth/login', () => {
  test('answers 200 with a valid token for the right credentials', async () => {
    const registered = await register();
    const res = await login({ email: 'ana@acme.com', password: PASSWORD });
    assert.equal(res.status, 200);
    const decoded = jwt.verify(res.body.token, process.env.JWT_SECRET);
    assert.equal(decoded.sub, registered.body.user.id);
    assert.equal(res.body.user.email, 'ana@acme.com');
    assert.equal('passwordHash' in res.body.user, false);
  });

  test('accepts the email in any letter case', async () => {
    await register();
    const res = await login({ email: 'ANA@ACME.COM', password: PASSWORD });
    assert.equal(res.status, 200);
  });

  // The three failures below must be indistinguishable, so an attacker
  // cannot discover which emails or companies exist.
  test('answers the same 401 for a wrong password, an unknown email and an unknown domain', async () => {
    await register();
    const wrongPassword = await login({ email: 'ana@acme.com', password: 'wrong' });
    const unknownEmail = await login({ email: 'nobody@acme.com', password: PASSWORD });
    const unknownDomain = await login({ email: 'ana@other.com', password: PASSWORD });
    for (const res of [wrongPassword, unknownEmail, unknownDomain]) {
      assert.equal(res.status, 401);
      assert.equal(res.body.token, undefined);
    }
    assert.deepEqual(unknownEmail.body, wrongPassword.body);
    assert.deepEqual(unknownDomain.body, wrongPassword.body);
  });

  test('refuses missing fields (400)', async () => {
    assert.equal((await login({ email: 'ana@acme.com' })).status, 400);
    assert.equal((await login({ password: PASSWORD })).status, 400);
    assert.equal((await login({})).status, 400);
  });

  // The classic attack: {"email": {"$ne": null}} tries to match any user.
  test('NoSQL injection in email never logs anyone in', async () => {
    await register();
    const res = await login({ email: { $ne: null }, password: PASSWORD });
    assert.notEqual(res.status, 200);
    assert.equal(res.body.token, undefined);
  });

  test('NoSQL injection in password never logs anyone in', async () => {
    await register();
    const res = await login({ email: 'ana@acme.com', password: { $ne: null } });
    assert.notEqual(res.status, 200);
    assert.equal(res.body.token, undefined);
  });

  test('NoSQL injection in email is rejected with a clean 400', async () => {
    await register();
    const res = await login({ email: { $ne: null }, password: PASSWORD });
    assert.equal(res.status, 400);
  });

  test('NoSQL injection in password is rejected with a clean 400', async () => {
    await register();
    const res = await login({ email: 'ana@acme.com', password: { $ne: null } });
    assert.equal(res.status, 400);
  });
});

describe('protected route GET /api/auth/me', () => {
  test('answers 401 without a token', async () => {
    const res = await request(app).get('/api/auth/me');
    assert.equal(res.status, 401);
  });

  test('answers 401 with a forged token', async () => {
    const registered = await register();
    const forged = jwt.sign({ sub: registered.body.user.id }, 'another-secret');
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${forged}`);
    assert.equal(res.status, 401);
  });

  test('answers 200 with the current user for a valid token', async () => {
    const registered = await register();
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${registered.body.token}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.user.email, 'ana@acme.com');
    assert.equal('passwordHash' in res.body.user, false);
  });
});

describe('PUT /api/auth/me', () => {
  test('updates name, department and avatar of the current user', async () => {
    const { body } = await register();
    const res = await request(app)
      .put('/api/auth/me')
      .set('Authorization', `Bearer ${body.token}`)
      .send({ name: 'Ana B', department: 'Database Admin', avatarUrl: 'https://example.com/a.png' });
    assert.equal(res.status, 200);
    const saved = await User.findById(body.user.id);
    assert.equal(saved.name, 'Ana B');
    assert.equal(saved.department, 'Database Admin');
    assert.equal(saved.avatarUrl, 'https://example.com/a.png');
  });

  // Account takeover / tenant hopping: email and company must not be editable.
  test('ignores attempts to change email or company', async () => {
    const { body } = await register();
    const res = await request(app)
      .put('/api/auth/me')
      .set('Authorization', `Bearer ${body.token}`)
      .send({ name: 'Ana B', email: 'evil@other.com', company: '507f1f77bcf86cd799439011' });
    assert.equal(res.status, 200);
    const saved = await User.findById(body.user.id);
    assert.equal(saved.email, 'ana@acme.com');
    assert.equal(String(saved.company), body.user.company);
  });

  test('answers 401 without a token', async () => {
    const res = await request(app).put('/api/auth/me').send({ name: 'X' });
    assert.equal(res.status, 401);
  });
});

describe('GET /api/auth/providers', () => {
  test('tells which OAuth providers are configured (booleans only, no secret)', async () => {
    const res = await request(app).get('/api/auth/providers');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { google: true, microsoft: true }); // fake values set by tests/setup/env.js
  });
});


// Every text field must be a string. Anything else (objects like {"$ne": null},
// numbers, arrays) must be refused with a clean 400, before anything is written.
describe('input type validation', () => {
  const WRONG_VALUES = [{ $ne: null }, 123, ['a'], true];

  test('register refuses a non-string field with a 400, and creates nothing', async () => {
    for (const field of ['name', 'email', 'password', 'companyName', 'department']) {
      for (const value of WRONG_VALUES) {
        const res = await register({ [field]: value });
        assert.equal(res.status, 400, `${field} = ${JSON.stringify(value)}`);
        assert.equal(res.body.token, undefined);
      }
    }
    // Nothing written, not even an orphan company created before the user failed.
    assert.equal(await User.countDocuments(), 0);
    assert.equal(await Company.countDocuments(), 0);
  });

  test('login refuses a non-string email or password with a 400', async () => {
    await register();
    for (const field of ['email', 'password']) {
      for (const value of WRONG_VALUES) {
        const res = await login({ email: 'ana@acme.com', password: PASSWORD, [field]: value });
        assert.equal(res.status, 400, `${field} = ${JSON.stringify(value)}`);
        assert.equal(res.body.token, undefined);
      }
    }
  });

  test('PUT /me refuses a non-string field with a 400 and changes nothing', async () => {
    const { body } = await register();
    for (const field of ['name', 'department', 'avatarUrl']) {
      for (const value of WRONG_VALUES) {
        const res = await request(app)
          .put('/api/auth/me')
          .set('Authorization', `Bearer ${body.token}`)
          .send({ [field]: value });
        assert.equal(res.status, 400, `${field} = ${JSON.stringify(value)}`);
      }
    }
    const saved = await User.findById(body.user.id);
    assert.equal(saved.name, 'Ana');
    assert.equal(saved.department, 'DevOps');
    assert.equal(saved.avatarUrl, '');
  });

  // The optional fields may still be left out (or null) by the frontend.
  test('department stays optional on register and avatarUrl/department on PUT /me', async () => {
    const created = await register({ department: undefined });
    assert.equal(created.status, 201);
    const res = await request(app)
      .put('/api/auth/me')
      .set('Authorization', `Bearer ${created.body.token}`)
      .send({ department: null, avatarUrl: null });
    assert.equal(res.status, 200);
  });
});