const express = require('express');
const cors = require('cors');
const passport = require('./src/config/passport');

const authRoutes = require('./src/routes/auth.routes');
const problemRoutes = require('./src/routes/problem.routes');
const companyRoutes = require('./src/routes/company.routes');
const notificationRoutes = require('./src/routes/notification.routes');

const app = express();

app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173' }));
app.use(express.json());
app.use(passport.initialize());

app.get('/api/health', (req, res) => res.json({ ok: true, service: 'fixbook-backend' }));

app.use('/api/auth', authRoutes);
app.use('/api/problems', problemRoutes);
app.use('/api/company', companyRoutes);
app.use('/api/notifications', notificationRoutes);

// Central error handler as a safety net for anything routes don't catch
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

module.exports = app;