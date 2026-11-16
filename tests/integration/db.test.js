const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const connectDB = require('../../src/config/db');
const { useTestDatabase } = require('../helpers/db');
const { getTestDatabaseName } = require('../helpers/guard');

useTestDatabase();

describe('database connection', () => {
  // Proves the setup connected us to the dedicated test database, never the development one.
  test('is connected to the dedicated test database', () => {
    assert.equal(mongoose.connection.readyState, 1);
    assert.equal(mongoose.connection.name, getTestDatabaseName());
  });

  // Covers the real src/config/db.js: it must read MONGO_URI from the environment.
  test('connectDB() connects using MONGO_URI', async (t) => {
    t.mock.method(console, 'log', () => {}); // silence the app's log line, restored automatically
    await mongoose.disconnect();

    await connectDB();

    assert.equal(mongoose.connection.readyState, 1);
    assert.equal(mongoose.connection.name, getTestDatabaseName());
  });
});