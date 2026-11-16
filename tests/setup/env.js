// Fake configuration for tests. No real secret here, and no .env file is read:
// tests must behave the same on a developer machine and in CI.
// Values already present in the environment (set by scripts/test.sh in CI) win.
const defaults = {
  CLIENT_URL: 'http://localhost:5173',
  JWT_SECRET: 'ci-test-jwt-secret',
  SESSION_SECRET: 'ci-test-session-secret',
  JWT_EXPIRES_IN: '1h',
  GOOGLE_CLIENT_ID: 'ci-test',
  GOOGLE_CLIENT_SECRET: 'ci-test',
  GOOGLE_CALLBACK_URL: 'http://localhost:5000/api/auth/google/callback',
  MICROSOFT_CLIENT_ID: 'ci-test',
  MICROSOFT_CLIENT_SECRET: 'ci-test',
  MICROSOFT_CALLBACK_URL: 'http://localhost:5000/api/auth/microsoft/callback',
  MICROSOFT_TENANT: 'common',
};

for (const [key, value] of Object.entries(defaults)) {
  if (process.env[key] === undefined) process.env[key] = value;
}