const express = require('express');
const Problem = require('../models/Problem');
const Notification = require('../models/Notification');
const { requireAuth } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const validateObjectIdParam = require('../middleware/validateObjectId');
const { serializeProblem } = require('../utils/lifecycle');

const router = express.Router();
router.use(requireAuth); // every route below requires a logged-in user
router.param('id', validateObjectIdParam);
router.param('validationId', validateObjectIdParam);
router.param('commentId', validateObjectIdParam);

// ---------- List / search ----------
// GET /api/problems?q=connection+refused&category=Backend&status=verified&tag=docker
// GET /api/problems?mine=true  -> only my own entries (drafts included) - "My Entries"
router.get('/', asyncHandler(async (req, res) => {
  try {
    const { q, category, tag, status, mine } = req.query;
    const filter = { company: req.companyId };
    if (category) filter.category = category;
    if (tag) filter.tags = tag;

    if (mine === 'true') {
      // "My Entries": everything I authored, drafts included.
      filter.author = req.user._id;
    } else {
      // The company-wide feed never shows anyone's drafts, including your own
      // - drafts only live in "My Entries" until published.
      filter.isDraft = { $ne: true };
    }

    let query = Problem.find(filter);
    if (q) {
      // $text search when a query string is present, scored by relevance
      query = Problem.find({ ...filter, $text: { $search: q } }, { score: { $meta: 'textScore' } }).sort({
        score: { $meta: 'textScore' },
      });
    } else {
      query = query.sort({ updatedAt: -1 });
    }

    const problems = await query.populate('author', 'name email department').lean();
    let serialized = problems.map(serializeProblem);

    // status is derived, so it's filtered in application code after fetch
    if (status) serialized = serialized.filter((p) => p.status === status);

    res.json({ problems: serialized });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
}));

// ---------- Get one ----------
router.get('/:id', asyncHandler(async (req, res) => {
  const problem = await Problem.findOne({ _id: req.params.id, company: req.companyId })
    .populate('author', 'name email department')
    .populate('solution.author', 'name email department')
    .populate('solution.validations.validator', 'name email department')
    .lean();
  if (!problem) return res.status(404).json({ error: 'Problem not found' });

  // Drafts are private to their author - treat as not-found for anyone else,
  // same signal as a genuinely missing entry so we don't leak its existence.
  if (problem.isDraft && String(problem.author._id || problem.author) !== String(req.user._id)) {
    return res.status(404).json({ error: 'Problem not found' });
  }

  res.json({ problem: serializeProblem(problem) });
}));

// ---------- Create ----------
// isDraft: true saves it privately under "My Entries" without requiring
// description/logs yet. Anything else (the normal "Log it" action) publishes
// immediately and requires description + logs.
router.post('/', asyncHandler(async (req, res) => {
  try {
    const { title, description, category, application, environment, logs, tags, occurredAt, isDraft } = req.body;
    const saveAsDraft = Boolean(isDraft);

    if (!saveAsDraft) {
      if (!description) return res.status(400).json({ error: 'description is required' });
      if (!logs) return res.status(400).json({ error: 'logs is required' });
    }

    // Title is optional - fall back to a truncated description so the entry
    // still has something sensible to display in lists.
    const finalTitle =
      title && title.trim() ? title.trim() : (description || '').trim().slice(0, 80) || 'Untitled entry';

    const problem = await Problem.create({
      company: req.companyId,
      title: finalTitle,
      description,
      category: category && category.trim() ? category : 'N/A',
      application,
      environment,
      logs,
      tags: tags || [],
      occurredAt: occurredAt || Date.now(),
      author: req.user._id,
      isDraft: saveAsDraft,
    });
    res.status(201).json({ problem: serializeProblem(problem) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
}));

// ---------- Publish a draft (the "Log it" action for a saved draft) ----------
router.post('/:id/publish', asyncHandler(async (req, res) => {
  const problem = await Problem.findOne({ _id: req.params.id, company: req.companyId });
  if (!problem) return res.status(404).json({ error: 'Problem not found' });
  if (String(problem.author) !== String(req.user._id)) {
    return res.status(403).json({ error: 'Only the author can publish this entry' });
  }
  if (!problem.description) return res.status(400).json({ error: 'description is required before publishing' });
  if (!problem.logs) return res.status(400).json({ error: 'logs is required before publishing' });

  problem.isDraft = false;
  problem.updatedAt = new Date();
  await problem.save();
  res.json({ problem: serializeProblem(problem) });
}));

// ---------- Edit problem fields ----------
router.put('/:id', asyncHandler(async (req, res) => {
  const problem = await Problem.findOne({ _id: req.params.id, company: req.companyId });
  if (!problem) return res.status(404).json({ error: 'Problem not found' });

  const editable = ['title', 'description', 'category', 'application', 'environment', 'logs', 'tags', 'occurredAt'];
  for (const field of editable) {
    if (req.body[field] !== undefined) problem[field] = req.body[field];
  }
  problem.updatedAt = new Date();
  await problem.save();
  res.json({ problem: serializeProblem(problem) });
}));

// ---------- Delete ----------
router.delete('/:id', asyncHandler(async (req, res) => {
  const problem = await Problem.findOne({ _id: req.params.id, company: req.companyId });
  if (!problem) return res.status(404).json({ error: 'Problem not found' });
  if (String(problem.author) !== String(req.user._id)) {
    return res.status(403).json({ error: 'Only the author can delete this entry' });
  }
  await problem.deleteOne();
  res.json({ ok: true });
}));

// ---------- Add / update the solution (direct fix + troubleshooting steps) ----------
router.put('/:id/solution', asyncHandler(async (req, res) => {
  const problem = await Problem.findOne({ _id: req.params.id, company: req.companyId });
  if (!problem) return res.status(404).json({ error: 'Problem not found' });

  const { description, troubleshootingSteps, relatedResources } = req.body;
  if (!problem.solution.createdAt) problem.solution.createdAt = new Date();
  problem.solution.description = description ?? problem.solution.description;
  if (Array.isArray(troubleshootingSteps)) problem.solution.troubleshootingSteps = troubleshootingSteps;
  if (Array.isArray(relatedResources)) problem.solution.relatedResources = relatedResources;
  problem.solution.author = problem.solution.author || req.user._id;
  problem.solution.updatedAt = new Date();
  problem.updatedAt = new Date();

  await problem.save();
  res.json({ problem: serializeProblem(problem) });
}));

// ---------- Delete the solution ----------
router.delete('/:id/solution', asyncHandler(async (req, res) => {
  const problem = await Problem.findOne({ _id: req.params.id, company: req.companyId });
  if (!problem) return res.status(404).json({ error: 'Problem not found' });
  if (String(problem.author) !== String(req.user._id)) {
    return res.status(403).json({ error: 'Only the entry author can delete the solution' });
  }
  problem.solution = {};
  problem.updatedAt = new Date();
  await problem.save();
  res.json({ problem: serializeProblem(problem) });
}));

// ---------- Validate a solution ----------
// A validation is a department-stamped confirmation, not an anonymous
// upvote: "T. Jakob - Database Admin" confirms this fix worked for them.
// It targets the SOLUTION specifically, not the entry: you can validate an
// entry you logged yourself, as long as someone else (not you) wrote the fix.
router.post('/:id/validations', asyncHandler(async (req, res) => {
  const problem = await Problem.findOne({ _id: req.params.id, company: req.companyId });
  if (!problem) return res.status(404).json({ error: 'Problem not found' });
  if (!problem.solution || (!problem.solution.description && problem.solution.troubleshootingSteps.length === 0)) {
    return res.status(400).json({ error: 'This entry has no solution yet to validate' });
  }

  const isOwnSolution = problem.solution.author && String(problem.solution.author) === String(req.user._id);
  if (isOwnSolution) {
    return res.status(403).json({ error: "You can't validate a solution you proposed yourself" });
  }

  // Department always comes from the validator's own profile - never
  // client-supplied - so a validation stamp can't be spoofed or edited per-use.
  if (!req.user.department) {
    return res.status(400).json({ error: 'Set your department in your profile before validating an entry' });
  }

  const alreadyValidated = problem.solution.validations.some(
    (v) => String(v.validator) === String(req.user._id)
  );
  if (alreadyValidated) {
    return res.status(409).json({ error: "You've already validated this entry — remove your existing validation first to change it" });
  }

  problem.solution.validations.push({
    validator: req.user._id,
    validatorName: req.user.name,
    department: req.user.department,
    comment: req.body.comment || '',
  });
  problem.updatedAt = new Date();
  await problem.save();

  // Notify the SOLUTION's author (the person whose fix just got validated),
  // not necessarily the entry's author - those can be different people.
  const solutionAuthorId = problem.solution.author;
  if (solutionAuthorId && String(solutionAuthorId) !== String(req.user._id)) {
    await Notification.create({
      company: req.companyId,
      recipient: solutionAuthorId,
      type: 'validation',
      problem: problem._id,
      triggeredBy: req.user._id,
      message: `${req.user.name} (${req.user.department}) validated your solution on "${problem.title}"`,
    });
  }

  res.status(201).json({ problem: serializeProblem(problem) });
}));

router.delete('/:id/validations/:validationId', asyncHandler(async (req, res) => {
  const problem = await Problem.findOne({ _id: req.params.id, company: req.companyId });
  if (!problem) return res.status(404).json({ error: 'Problem not found' });

  const validation = problem.solution.validations.id(req.params.validationId);
  if (!validation) return res.status(404).json({ error: 'Validation not found' });
  if (String(validation.validator) !== String(req.user._id)) {
    return res.status(403).json({ error: 'You can only remove your own validation' });
  }
  validation.deleteOne();
  await problem.save();
  res.json({ problem: serializeProblem(problem) });
}));

// ---------- Comments ----------
// General discussion, independent of validation - anyone can comment any
// time, whether or not they've validated the solution. parentId makes it a
// reply, which notifies the parent comment's author instead of the entry's.
router.post('/:id/comments', asyncHandler(async (req, res) => {
  const problem = await Problem.findOne({ _id: req.params.id, company: req.companyId });
  if (!problem) return res.status(404).json({ error: 'Problem not found' });

  const text = (req.body.text || '').trim();
  if (!text) return res.status(400).json({ error: 'Comment text is required' });

  const parentId = req.body.parentId || null;
  let parentComment = null;
  if (parentId) {
    parentComment = problem.comments.id(parentId);
    if (!parentComment) return res.status(404).json({ error: 'Parent comment not found' });
  }

  problem.comments.push({ author: req.user._id, authorName: req.user.name, text, parentComment: parentId });
  problem.updatedAt = new Date();
  await problem.save();

  // Notify whoever is most relevant to this specific comment: the parent
  // comment's author for a reply, otherwise the entry's author.
  const recipientId = parentComment ? parentComment.author : problem.author;
  if (recipientId && String(recipientId) !== String(req.user._id)) {
    await Notification.create({
      company: req.companyId,
      recipient: recipientId,
      type: 'comment',
      problem: problem._id,
      triggeredBy: req.user._id,
      message: parentComment
        ? `${req.user.name} replied to your comment on "${problem.title}"`
        : `${req.user.name} commented on your entry "${problem.title}"`,
    });
  }

  res.status(201).json({ problem: serializeProblem(problem) });
}));

router.delete('/:id/comments/:commentId', asyncHandler(async (req, res) => {
  const problem = await Problem.findOne({ _id: req.params.id, company: req.companyId });
  if (!problem) return res.status(404).json({ error: 'Problem not found' });

  const comment = problem.comments.id(req.params.commentId);
  if (!comment) return res.status(404).json({ error: 'Comment not found' });
  if (String(comment.author) !== String(req.user._id)) {
    return res.status(403).json({ error: 'You can only remove your own comment' });
  }
  comment.deleteOne();
  await problem.save();
  res.json({ problem: serializeProblem(problem) });
}));

// ---------- Archive (the one manual lifecycle transition, author-only) ----------
router.post('/:id/archive', asyncHandler(async (req, res) => {
  const problem = await Problem.findOne({ _id: req.params.id, company: req.companyId });
  if (!problem) return res.status(404).json({ error: 'Problem not found' });
  if (String(problem.author) !== String(req.user._id)) {
    return res.status(403).json({ error: 'Only the author can archive this entry' });
  }
  problem.archivedAt = new Date();
  problem.archivedBy = req.user._id;
  problem.archiveReason = req.body.reason || '';
  await problem.save();
  res.json({ problem: serializeProblem(problem) });
}));

router.post('/:id/unarchive', asyncHandler(async (req, res) => {
  const problem = await Problem.findOne({ _id: req.params.id, company: req.companyId });
  if (!problem) return res.status(404).json({ error: 'Problem not found' });
  if (String(problem.author) !== String(req.user._id)) {
    return res.status(403).json({ error: 'Only the author can unarchive this entry' });
  }
  problem.archivedAt = null;
  problem.archivedBy = null;
  await problem.save();
  res.json({ problem: serializeProblem(problem) });
}));

module.exports = router;