const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Verifies the JWT sent in the Authorization header, loads the user, and
// attaches both req.user and req.companyId. Every route below this uses
// req.companyId to scope its Mongo queries - this is what actually enforces
// tenant isolation, not just a field the client sends.
async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Missing auth token' });

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.sub);
    if (!user) return res.status(401).json({ error: 'User not found' });

    req.user = user;
    req.companyId = user.company;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function signToken(user) {
  return jwt.sign({ sub: user._id.toString(), company: user.company.toString() }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
}

module.exports = { requireAuth, signToken };
