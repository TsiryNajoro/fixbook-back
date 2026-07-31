const mongoose = require('mongoose');

// A single validation = one person, from one department, vouching that the
// solution worked for them. This is NOT an anonymous upvote - it's a stamp
// tied to an identity and a role, e.g. "T. Jakob - Database Admin".
const validationSchema = new mongoose.Schema(
  {
    validator: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // Snapshot of the validator's name/department at validation time, so the
    // stamp still reads correctly even if the person later changes teams.
    validatorName: { type: String, required: true },
    department: { type: String, required: true },
    comment: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true, versionKey: false }
);

// A general discussion comment - independent of validation. Anyone can leave
// one, any time, whether or not they've validated the solution. parentComment
// makes it a reply when set.
const commentSchema = new mongoose.Schema(
  {
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    authorName: { type: String, required: true },
    text: { type: String, required: true },
    parentComment: { type: mongoose.Schema.Types.ObjectId, default: null },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true, versionKey: false }
);

const solutionSchema = new mongoose.Schema(
  {
    description: { type: String, default: '' }, // direct fix, for simple problems
    troubleshootingSteps: { type: [String], default: [] }, // ordered investigation steps
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    relatedResources: { type: [String], default: [] }, // links, doc refs, etc.
    createdAt: { type: Date },
    updatedAt: { type: Date },
    validations: { type: [validationSchema], default: [] },
  },
  { _id: false, versionKey: false }
);

const problemSchema = new mongoose.Schema(
  {
    company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },

    title: { type: String, trim: true, default: '' },
    description: { type: String, default: '' },
    category: { type: String, default: 'N/A' },
    application: { type: String, default: '' }, // affected app/service
    environment: { type: String, default: '' }, // e.g. Production, Staging
    logs: { type: String, default: '' },
    occurredAt: { type: Date, default: Date.now },

    tags: { type: [String], default: [] },

    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    // A draft is only visible to its author, in "My Entries" - it never shows
    // in the company-wide feed until explicitly published. This is the ONLY
    // meaning of "Draft": it has nothing to do with whether a solution has
    // been added yet (see utils/lifecycle.js).
    isDraft: { type: Boolean, default: false },

    solution: { type: solutionSchema, default: () => ({}) },

    comments: { type: [commentSchema], default: [] },

    // Archived is the ONE manual lifecycle transition, author-only. Everything
    // else (draft/published/verified/needs_review) is derived, see utils/lifecycle.js
    archivedAt: { type: Date, default: null },
    archivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    archiveReason: { type: String, default: '' },

    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

// Full-text search across the fields people actually search by, weighted so
// title/tags matches rank above a log dump matching.
problemSchema.index(
  { title: 'text', description: 'text', tags: 'text', logs: 'text', application: 'text' },
  { weights: { title: 10, tags: 8, application: 5, description: 3, logs: 1 } }
);

module.exports = mongoose.model('Problem', problemSchema);