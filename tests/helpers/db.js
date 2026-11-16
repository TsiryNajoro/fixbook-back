const mongoose = require('mongoose');
const { before, afterEach, after } = require('node:test');
const { getTestDatabaseName } = require('./guard');

// Models must be registered so their indexes (unique email, unique domain,
// text search) can be built before the tests run.
require('../../src/models/User');
require('../../src/models/Company');
require('../../src/models/Problem');
require('../../src/models/Notification');

async function connectTestDatabase() {
  const expectedName = getTestDatabaseName();
  // Fail fast (10 s) instead of the 30 s default when MongoDB is unreachable.
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 });
  if (mongoose.connection.name !== expectedName) {
    await mongoose.disconnect();
    throw new Error('Connected database does not match the expected test database.');
  }
  // Wait for index creation so uniqueness and text search work from test #1.
  await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
}

// deleteMany (not drop): documents are removed but indexes are kept.
async function clearDatabase() {
  const collections = Object.values(mongoose.connection.collections);
  await Promise.all(collections.map((collection) => collection.deleteMany({})));
}

async function disconnectTestDatabase() {
  await mongoose.disconnect();
}

// Call once at the top of each integration test file.
function useTestDatabase() {
  before(connectTestDatabase);          // connect + build indexes, once per file
  afterEach(clearDatabase);             // every test starts from an empty database
  after(disconnectTestDatabase);        // no open handle left behind
}

module.exports = { useTestDatabase, connectTestDatabase, clearDatabase, disconnectTestDatabase };