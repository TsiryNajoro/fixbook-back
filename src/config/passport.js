const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const MicrosoftStrategy = require('passport-microsoft').Strategy;
const User = require('../models/User');
const Company = require('../models/Company');

// Finds (or creates) the Company workspace matching a user's email domain,
// then finds (or creates) the User inside that company. This is how
// multi-tenancy plugs into OAuth: "you@acme.com" always lands in the
// "acme.com" workspace, isolated from every other company.
async function findOrCreateOAuthUser({ provider, providerId, name, email, avatarUrl }) {
  const domain = email.split('@')[1].toLowerCase();

  let company = await Company.findOne({ domain });
  if (!company) {
    company = await Company.create({ name: domain, domain });
  }

  const idField = provider === 'google' ? 'googleId' : 'microsoftId';

  let user = await User.findOne({ company: company._id, email: email.toLowerCase() });
  if (!user) {
    user = await User.create({
      company: company._id,
      name,
      email: email.toLowerCase(),
      avatarUrl,
      [idField]: providerId,
    });
  } else if (!user[idField]) {
    // Existing basic-login user is linking an OAuth provider for the first time
    user[idField] = providerId;
    await user.save();
  }

  return user;
}

if (process.env.GOOGLE_CLIENT_ID) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.GOOGLE_CALLBACK_URL,
        scope: ['profile', 'email'],
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          const email = profile.emails && profile.emails[0] && profile.emails[0].value;
          if (!email) return done(new Error('Google account has no email'));
          const user = await findOrCreateOAuthUser({
            provider: 'google',
            providerId: profile.id,
            name: profile.displayName,
            email,
            avatarUrl: profile.photos && profile.photos[0] && profile.photos[0].value,
          });
          done(null, user);
        } catch (err) {
          done(err);
        }
      }
    )
  );
}

if (process.env.MICROSOFT_CLIENT_ID) {
  passport.use(
    new MicrosoftStrategy(
      {
        clientID: process.env.MICROSOFT_CLIENT_ID,
        clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
        callbackURL: process.env.MICROSOFT_CALLBACK_URL,
        tenant: process.env.MICROSOFT_TENANT || 'common',
        scope: ['user.read'],
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          const email =
            profile.emails && profile.emails[0] && profile.emails[0].value;
          if (!email) return done(new Error('Microsoft account has no email'));
          const user = await findOrCreateOAuthUser({
            provider: 'microsoft',
            providerId: profile.id,
            name: profile.displayName,
            email,
            avatarUrl: '',
          });
          done(null, user);
        } catch (err) {
          done(err);
        }
      }
    )
  );
}

module.exports = passport;
