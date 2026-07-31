const express = require('express');
const Notification = require('../models/Notification');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// List my notifications, most recent first
router.get('/', async (req, res) => {
  const notifications = await Notification.find({ company: req.companyId, recipient: req.user._id })
    .sort({ createdAt: -1 })
    .limit(50)
    .populate('problem', 'title')
    .populate('triggeredBy', 'name department')
    .lean();
  const unreadCount = await Notification.countDocuments({
    company: req.companyId,
    recipient: req.user._id,
    read: false,
  });
  res.json({ notifications, unreadCount });
});

router.patch('/:id/read', async (req, res) => {
  const notification = await Notification.findOneAndUpdate(
    { _id: req.params.id, recipient: req.user._id, company: req.companyId },
    { read: true },
    { new: true }
  );
  if (!notification) return res.status(404).json({ error: 'Notification not found' });
  res.json({ notification });
});

router.patch('/read-all', async (req, res) => {
  await Notification.updateMany({ company: req.companyId, recipient: req.user._id, read: false }, { read: true });
  res.json({ ok: true });
});

module.exports = router;