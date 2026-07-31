const mongoose = require('mongoose');

// A Company is a tenant. Every Problem/Solution/Validation/User belongs to
// exactly one Company, and all queries are scoped by companyId (see
// middleware/tenant.js) so that one company can never see another's data.
const companySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    // Domain is used to auto-assign new OAuth users to the right company
    // (e.g. "acme.com" -> Acme Corp workspace). Must be unique.
    domain: { type: String, required: true, unique: true, lowercase: true, trim: true },
    categories: {
      type: [String],
      default: ['Backend', 'Frontend', 'Infrastructure', 'Database', 'Security', 'Networking'],
    },
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

module.exports = mongoose.model('Company', companySchema);
