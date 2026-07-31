const express = require('express');
const Company = require('../models/Company');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/me', requireAuth, async (req, res) => {
  const company = await Company.findById(req.companyId);
  res.json({ company });
});

router.patch('/categories', requireAuth, async (req, res) => {
  const { categories } = req.body;
  if (!Array.isArray(categories)) return res.status(400).json({ error: 'categories must be an array' });
  const company = await Company.findByIdAndUpdate(req.companyId, { categories }, { new: true });
  res.json({ company });
});

module.exports = router;
