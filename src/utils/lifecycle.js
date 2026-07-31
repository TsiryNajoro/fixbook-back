// FixBook lifecycle rules
//
//   Draft -> Published -> Verified -> Needs Review -> Archived
//
// - Draft: the entry was saved but never "logged"/published (isDraft: true
//   on the model). It's only visible to its author, in "My Entries". This is
//   the ONLY meaning of Draft - it has nothing to do with whether a solution
//   has been added yet.
// - Published: the moment "Log it" is clicked, the entry is Published,
//   whether or not it has a solution yet. There's no in-between state for
//   "logged but no fix recorded" - that's just Published with an empty
//   Solution section.
// - Verified: at least one validation exists on the solution and it's recent
//   enough (see NEEDS_REVIEW_AFTER_DAYS).
// - Needs Review: it was Verified, but the last validation is stale.
// - Archived: the one manual, author-only transition - kept for historical
//   reference rather than deleted.

const NEEDS_REVIEW_AFTER_DAYS = 180; // ~6 months since last validation

function lastValidationDate(problem) {
  const validations = problem.solution && problem.solution.validations;
  if (!validations || validations.length === 0) return null;
  return validations.reduce(
    (latest, v) => (v.createdAt > latest ? v.createdAt : latest),
    validations[0].createdAt
  );
}

function computeStatus(problem) {
  if (problem.archivedAt) return 'archived';
  if (problem.isDraft) return 'draft';

  const lastValidated = lastValidationDate(problem);
  if (!lastValidated) return 'published';

  const daysSince = (Date.now() - new Date(lastValidated).getTime()) / (1000 * 60 * 60 * 24);
  if (daysSince > NEEDS_REVIEW_AFTER_DAYS) return 'needs_review';
  return 'verified';
}

// Groups validations by department for a human-friendly reliability summary,
// e.g. { "Database Admin": 3, "DevOps": 2 } instead of a raw upvote count.
function validationSummary(problem) {
  const validations = (problem.solution && problem.solution.validations) || [];
  const byDept = {};
  for (const v of validations) {
    byDept[v.department] = (byDept[v.department] || 0) + 1;
  }
  return { total: validations.length, byDepartment: byDept };
}

function serializeProblem(problem) {
  const obj = problem.toObject ? problem.toObject() : problem;
  return {
    ...obj,
    status: computeStatus(obj),
    validationSummary: validationSummary(obj),
  };
}

module.exports = { computeStatus, validationSummary, serializeProblem, NEEDS_REVIEW_AFTER_DAYS };