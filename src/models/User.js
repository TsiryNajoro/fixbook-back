const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },

    // Basic login (optional, used when no OAuth provider is linked)
    passwordHash: { type: String, select: false },

    // OAuth identifiers (a user can have one, both, or neither if basic-login only)
    googleId: { type: String, index: true, sparse: true },
    microsoftId: { type: String, index: true, sparse: true },

    // The department/role a user's validations are stamped with, e.g.
    // "Database Admin", "DevOps", "Network & Systems". Free text so any
    // company can define their own department names.
    department: { type: String, default: '' },

    avatarUrl: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

// One email per company (same person could theoretically exist across
// different company workspaces with the same email, but not twice in one).
userSchema.index({ company: 1, email: 1 }, { unique: true });

userSchema.methods.setPassword = async function (plainPassword) {
  this.passwordHash = await bcrypt.hash(plainPassword, 10);
};

userSchema.methods.checkPassword = async function (plainPassword) {
  if (!this.passwordHash) return false;
  return bcrypt.compare(plainPassword, this.passwordHash);
};

userSchema.methods.toSafeJSON = function () {
  return {
    id: this._id,
    name: this.name,
    email: this.email,
    department: this.department,
    avatarUrl: this.avatarUrl,
    company: this.company,
  };
};

module.exports = mongoose.model('User', userSchema);
