const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const {
  computeStatus,
  validationSummary,
  serializeProblem,
  NEEDS_REVIEW_AFTER_DAYS,
} = require('../../src/utils/lifecycle');

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-06-01T12:00:00Z');

// Helper: a problem whose validations were created `daysAgo` days before NOW.
function problemValidatedDaysAgo(...daysAgo) {
  return {
    isDraft: false,
    solution: {
      validations: daysAgo.map((d) => ({ department: 'DevOps', createdAt: new Date(NOW.getTime() - d * DAY) })),
    },
  };
}

describe('lifecycle', () => {
  // computeStatus depends on the current date: freeze it so tests never
  // depend on when they run (no flaky test at the 180-day boundary).
  beforeEach((t) => {
    t.mock.timers.enable({ apis: ['Date'], now: NOW });
  });

  describe('computeStatus', () => {
    test('uses a 180-day threshold', () => {
      assert.equal(NEEDS_REVIEW_AFTER_DAYS, 180);
    });

    test('archived wins over everything else, even a draft', () => {
      assert.equal(computeStatus({ archivedAt: NOW, isDraft: true }), 'archived');
    });

    test('draft when isDraft is true', () => {
      assert.equal(computeStatus({ isDraft: true }), 'draft');
    });

    test('published when there is no validation (or no solution at all)', () => {
      assert.equal(computeStatus({ isDraft: false }), 'published');
      assert.equal(computeStatus({ isDraft: false, solution: { validations: [] } }), 'published');
    });

    test('verified with a recent validation', () => {
      assert.equal(computeStatus(problemValidatedDaysAgo(10)), 'verified');
    });

    // Boundary: exactly 180 days is still verified, one millisecond more is stale.
    test('stays verified at exactly 180 days, needs_review just after', () => {
      assert.equal(computeStatus(problemValidatedDaysAgo(180)), 'verified');
      const justOver = problemValidatedDaysAgo(180);
      justOver.solution.validations[0].createdAt = new Date(NOW.getTime() - 180 * DAY - 1);
      assert.equal(computeStatus(justOver), 'needs_review');
    });

    // Only the most recent validation counts: an old one must not hide a fresh one.
    test('uses the most recent validation among several', () => {
      assert.equal(computeStatus(problemValidatedDaysAgo(400, 5, 300)), 'verified');
      assert.equal(computeStatus(problemValidatedDaysAgo(400, 250, 300)), 'needs_review');
    });
  });

  describe('validationSummary', () => {
    test('empty summary without validations or solution', () => {
      assert.deepEqual(validationSummary({}), { total: 0, byDepartment: {} });
      assert.deepEqual(validationSummary({ solution: { validations: [] } }), { total: 0, byDepartment: {} });
    });

    test('counts validations by department', () => {
      const problem = {
        solution: {
          validations: [{ department: 'DevOps' }, { department: 'Database Admin' }, { department: 'DevOps' }],
        },
      };
      assert.deepEqual(validationSummary(problem), {
        total: 3,
        byDepartment: { DevOps: 2, 'Database Admin': 1 },
      });
    });
  });

  describe('serializeProblem', () => {
    test('adds status and validationSummary to a plain object, keeping its fields', () => {
      const out = serializeProblem({ title: 'T', ...problemValidatedDaysAgo(1) });
      assert.equal(out.title, 'T');
      assert.equal(out.status, 'verified');
      assert.equal(out.validationSummary.total, 1);
    });

    // Mongoose documents expose toObject(); the function must use it.
    test('accepts a document exposing toObject()', () => {
      const plain = { title: 'Doc', isDraft: true };
      const out = serializeProblem({ toObject: () => plain });
      assert.equal(out.title, 'Doc');
      assert.equal(out.status, 'draft');
      assert.deepEqual(out.validationSummary, { total: 0, byDepartment: {} });
    });
  });
});