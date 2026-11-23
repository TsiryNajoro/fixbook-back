const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const app = require('../../app');
const Problem = require('../../src/models/Problem');
const Notification = require('../../src/models/Notification');
const Company = require('../../src/models/Company');
const { useTestDatabase } = require('../helpers/db');
const { createCompany, createUser, api } = require('../helpers/factory');

useTestDatabase();

const BAD = 'abc';
const UNKNOWN = '507f1f77bcf86cd799439011'; // a valid id that matches nothing

// Problem routes that take an id, with the method and a path builder.
const PROBLEM_ROUTES = [
  ['get', (id) => `/api/problems/${id}`],
  ['post', (id) => `/api/problems/${id}/publish`],
  ['put', (id) => `/api/problems/${id}`],
  ['delete', (id) => `/api/problems/${id}`],
  ['put', (id) => `/api/problems/${id}/solution`],
  ['delete', (id) => `/api/problems/${id}/solution`],
  ['post', (id) => `/api/problems/${id}/validations`],
  ['delete', (id) => `/api/problems/${id}/validations/${UNKNOWN}`],
  ['post', (id) => `/api/problems/${id}/comments`],
  ['delete', (id) => `/api/problems/${id}/comments/${UNKNOWN}`],
  ['post', (id) => `/api/problems/${id}/archive`],
  ['post', (id) => `/api/problems/${id}/unarchive`],
];

// Before the fix, each of these requests made the whole Node process exit
// (unhandled CastError in an async route): one logged-in user could take the
// API down for everybody. Reaching the end of this file proves it stays up.
describe('malformed ids are refused with a 400 and never crash the server', () => {
  test('problem routes', async () => {
    const acme = await createCompany();
    const { token } = await createUser(acme);
    for (const [method, path] of PROBLEM_ROUTES) {
      const res = await api(token)[method](path(BAD), {});
      assert.equal(res.status, 400, `${method.toUpperCase()} ${path(BAD)}`);
      assert.deepEqual(res.body, { error: 'Invalid id' });
    }
  });

  test('problem sub-resource ids (validation, comment)', async () => {
    const acme = await createCompany();
    const { token } = await createUser(acme);
    const one = await api(token).delete(`/api/problems/${UNKNOWN}/validations/${BAD}`);
    const two = await api(token).delete(`/api/problems/${UNKNOWN}/comments/${BAD}`);
    assert.equal(one.status, 400);
    assert.equal(two.status, 400);
  });

  test('notification id', async () => {
    const acme = await createCompany();
    const { token } = await createUser(acme);
    const res = await api(token).patch(`/api/notifications/${BAD}/read`);
    assert.equal(res.status, 400);
  });

  // The route /read-all must not be mistaken for an id.
  test('PATCH /api/notifications/read-all still works', async () => {
    const acme = await createCompany();
    const { token } = await createUser(acme);
    const res = await api(token).patch('/api/notifications/read-all');
    assert.equal(res.status, 200);
  });

  // The 400 must not become a way to probe the API without being logged in.
  test('authentication is checked before the id: 401, not 400', async () => {
    const res = await request(app).get(`/api/problems/${BAD}`);
    assert.equal(res.status, 401);
  });

  test('a well-formed id that matches nothing is still a 404', async () => {
    const acme = await createCompany();
    const { token } = await createUser(acme);
    assert.equal((await api(token).get(`/api/problems/${UNKNOWN}`)).status, 404);
    assert.equal((await api(token).patch(`/api/notifications/${UNKNOWN}/read`)).status, 404);
  });
});

describe('PATCH /api/company/categories validates its content', () => {
  test('refuses anything that is not an array of strings (400)', async () => {
    const acme = await createCompany();
    const { token } = await createUser(acme);
    for (const categories of [[{ a: 1 }], ['ok', 1], [null], 'Backend', { $ne: null }]) {
      const res = await api(token).patch('/api/company/categories', { categories });
      assert.equal(res.status, 400, JSON.stringify(categories));
    }
    const company = await Company.findById(acme._id);
    assert.ok(company.categories.includes('Backend')); // unchanged
  });

  test('accepts an array of strings', async () => {
    const acme = await createCompany();
    const { token } = await createUser(acme);
    const res = await api(token).patch('/api/company/categories', { categories: ['Ops', 'Data'] });
    assert.equal(res.status, 200);
    assert.deepEqual([...res.body.company.categories], ['Ops', 'Data']);
  });
});

// Safety net: whatever goes wrong inside a route (here, the database fails),
// the client gets a generic 500 with no internal detail, and the server keeps
// answering the next requests.
describe('unexpected errors become a generic 500', () => {
  const SECRET = 'internal-detail-that-must-not-leak';

  test('every problem route, with the database failing', async (t) => {
    const acme = await createCompany();
    const { token } = await createUser(acme);
    t.mock.method(console, 'error', () => {}); // the central handler logs the error
    t.mock.method(Problem, 'findOne', () => { throw new Error(SECRET); });
    t.mock.method(Problem, 'find', () => { throw new Error(SECRET); });
    t.mock.method(Problem, 'create', async () => { throw new Error(SECRET); });

    const routes = [
      ['get', '/api/problems'],
      ['post', '/api/problems'],
      ...PROBLEM_ROUTES.map(([method, path]) => [method, path(UNKNOWN)]),
    ];
    for (const [method, path] of routes) {
      const res = await api(token)[method](path, { description: 'd', logs: 'l', text: 't' });
      assert.equal(res.status, 500, `${method.toUpperCase()} ${path}`);
      assert.deepEqual(res.body, { error: 'Internal server error' }, `${method.toUpperCase()} ${path}`);
      assert.equal(JSON.stringify(res.body).includes(SECRET), false);
    }
  });

  test('notification and company routes, with the database failing', async (t) => {
    const acme = await createCompany();
    const { token } = await createUser(acme);
    t.mock.method(console, 'error', () => {});
    t.mock.method(Notification, 'find', () => { throw new Error(SECRET); });
    t.mock.method(Notification, 'findOneAndUpdate', () => { throw new Error(SECRET); });
    t.mock.method(Notification, 'updateMany', () => { throw new Error(SECRET); });
    t.mock.method(Company, 'findById', () => { throw new Error(SECRET); });
    t.mock.method(Company, 'findByIdAndUpdate', () => { throw new Error(SECRET); });

    const routes = [
      ['get', '/api/notifications'],
      ['patch', `/api/notifications/${UNKNOWN}/read`],
      ['patch', '/api/notifications/read-all'],
      ['get', '/api/company/me'],
      ['patch', '/api/company/categories'],
    ];
    for (const [method, path] of routes) {
      const res = await api(token)[method](path, { categories: ['A'] });
      assert.equal(res.status, 500, `${method.toUpperCase()} ${path}`);
      assert.deepEqual(res.body, { error: 'Internal server error' }, `${method.toUpperCase()} ${path}`);
    }
  });

  test('the server keeps answering after an error', async (t) => {
    const acme = await createCompany();
    const { token } = await createUser(acme);
    t.mock.method(console, 'error', () => {});
    const failing = t.mock.method(Problem, 'findOne', () => { throw new Error(SECRET); });
    assert.equal((await api(token).get(`/api/problems/${UNKNOWN}`)).status, 500);
    failing.mock.restore();
    assert.equal((await api(token).get(`/api/problems/${UNKNOWN}`)).status, 404); // back to normal
    assert.equal((await request(app).get('/api/health')).status, 200);
  });
});