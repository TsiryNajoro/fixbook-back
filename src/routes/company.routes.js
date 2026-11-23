const express = require('express');
const Company = require('../models/Company');
const { requireAuth } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

router.get('/me', requireAuth, asyncHandler(async (req, res) => {
  const company = await Company.findById(req.companyId);
  res.json({ company });
}));

router.patch('/categories', requireAuth, asyncHandler(async (req, res) => {
  const { categories } = req.body;
  if (!Array.isArray(categories) || !categories.every((c) => typeof c === 'string')) {
    return res.status(400).json({ error: 'categories must be an array of strings' });
  }
  const company = await Company.findByIdAndUpdate(req.companyId, { categories }, { new: true });
  res.json({ company });
}));

module.exports = router;
