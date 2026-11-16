// Safety guard for integration tests (pure function: no database, no mongoose).
// Integration tests wipe collections, so they must NEVER run against the
// development database ("fixbook"). MONGO_URI is mandatory and the database
// name must contain "test" as a word (fixbook_test, ci-test, ...).
function getTestDatabaseName(uri = process.env.MONGO_URI) {
  if (!uri) {
    throw new Error('MONGO_URI is required to run integration tests (use a dedicated test database).');
  }
  const match = uri.match(/^mongodb(?:\+srv)?:\/\/[^/]+\/([^/?]+)/);
  const dbName = match ? decodeURIComponent(match[1]) : '';
  if (!/(^|[_-])test($|[_-])/i.test(dbName)) {
    // The URI is not printed on purpose: it could contain credentials.
    throw new Error(
      `Refusing to run: database "${dbName || '(none)'}" is not a test database. ` +
        'Its name must contain "test" as a word (for example fixbook_test).'
    );
  }
  return dbName;
}

module.exports = { getTestDatabaseName };