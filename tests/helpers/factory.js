const request = require('supertest');
const app = require('../../app');
const Company = require('../../src/models/Company');
const User = require('../../src/models/User');
const { signToken } = require('../../src/middleware/auth');

let counter = 0;

async function createCompany(domain = 'acme.com') {
  return Company.create({ name: domain, domain });
}

// Creates a user straight in the database (no bcrypt, so it is fast) and
// returns it with a valid token. Emails are unique inside a company.
async function createUser(company, overrides = {}) {
  counter += 1;
  const user = await User.create({
    company: company._id,
    name: `User ${counter}`,
    email: `user${counter}@${company.domain}`,
    department: 'DevOps',
    ...overrides,
  });
  return { user, token: signToken(user) };
}

// api(token).get(url) / .post(url, body) / .put / .patch / .delete,
// all sent with the Authorization header.
function api(token) {
  const call = (method) => (url, body) => {
    const req = request(app)[method](url).set('Authorization', `Bearer ${token}`);
    return body === undefined ? req : req.send(body);
  };
  return { get: call('get'), post: call('post'), put: call('put'), patch: call('patch'), delete: call('delete') };
}

module.exports = { createCompany, createUser, api };