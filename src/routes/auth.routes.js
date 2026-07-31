const express = require('express');
const passport = require('passport');
const User = require('../models/User');
const Company = require('../models/Company');
const { signToken, requireAuth } = require('../middleware/auth');

const router = express.Router();

// ---------- Basic email/password auth ----------
// Used alongside OAuth so a team can onboard even before Google/Microsoft
// SSO is configured, or for accounts that just prefer a password.

router.post('/register', async (req, res) => {
  try {
    const { name, email, password, companyName, department } = req.body;
    if (!name || !email || !password || !companyName) {
      return res.status(400).json({ error: 'name, email, password, companyName are required' });
    }
    const domain = email.split('@')[1]?.toLowerCase();
    if (!domain) return res.status(400).json({ error: 'Invalid email' });

    let company = await Company.findOne({ domain });
    if (!company) {
      company = await Company.create({ name: companyName, domain });
    }

    const existing = await User.findOne({ company: company._id, email: email.toLowerCase() });
    if (existing) return res.status(409).json({ error: 'An account with this email already exists' });

    const user = new User({ company: company._id, name, email: email.toLowerCase(), department });
    await user.setPassword(password);
    await user.save();

    const token = signToken(user);
    res.status(201).json({ token, user: user.toSafeJSON() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'email and password are required' });

    const domain = email.split('@')[1]?.toLowerCase();
    const company = await Company.findOne({ domain });
    if (!company) return res.status(401).json({ error: 'Invalid email or password' });

    const user = await User.findOne({ company: company._id, email: email.toLowerCase() }).select('+passwordHash');
    if (!user || !(await user.checkPassword(password))) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = signToken(user);
    res.json({ token, user: user.toSafeJSON() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user.toSafeJSON() });
});

router.put('/me', requireAuth, async (req, res) => {
  try {
    const { name, department, avatarUrl } = req.body;
    if (name !== undefined) req.user.name = name;
    if (department !== undefined) req.user.department = department;
    if (avatarUrl !== undefined) req.user.avatarUrl = avatarUrl;
    await req.user.save();
    res.json({ user: req.user.toSafeJSON() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- Which OAuth providers are actually configured ----------
// Lets the frontend gray out / explain buttons for providers that haven't
// had credentials added to .env yet, instead of the user hitting a raw
// "Internal Server Error" after clicking one.
router.get('/providers', (req, res) => {
  res.json({
    google: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    microsoft: Boolean(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET),
  });
});

// ---------- Google OAuth ----------
router.get('/google', (req, res, next) => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return res.redirect(`${process.env.CLIENT_URL}/login?error=google_not_configured`);
  }
  passport.authenticate('google', { session: false })(req, res, next);
});

router.get(
  '/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: `${process.env.CLIENT_URL}/login?error=google` }),
  (req, res) => {
    const token = signToken(req.user);
    res.redirect(`${process.env.CLIENT_URL}/oauth-callback?token=${token}`);
  }
);

// ---------- Microsoft OAuth ----------
router.get('/microsoft', (req, res, next) => {
  if (!process.env.MICROSOFT_CLIENT_ID || !process.env.MICROSOFT_CLIENT_SECRET) {
    return res.redirect(`${process.env.CLIENT_URL}/login?error=microsoft_not_configured`);
  }
  passport.authenticate('microsoft', { session: false })(req, res, next);
});

router.get(
  '/microsoft/callback',
  passport.authenticate('microsoft', {
    session: false,
    failureRedirect: `${process.env.CLIENT_URL}/login?error=microsoft`,
  }),
  (req, res) => {
    const token = signToken(req.user);
    res.redirect(`${process.env.CLIENT_URL}/oauth-callback?token=${token}`);
  }
);

module.exports = router;