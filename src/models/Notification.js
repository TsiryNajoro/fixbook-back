const mongoose = require('mongoose');

// Simple in-app notification. Only one type today ("validation"), but the
// shape leaves room for more (e.g. "comment") without a schema change.
const notificationSchema = new mongoose.Schema(
  {
    company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: ['validation', 'comment'], default: 'validation' },
    problem: { type: mongoose.Schema.Types.ObjectId, ref: 'Problem', required: true },
    triggeredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    message: { type: String, required: true },
    read: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

module.exports = mongoose.model('Notification', notificationSchema);