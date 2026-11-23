// Callback for router.param(): Express passes the matching URL segment.
// A malformed id is refused with a 400 before it reaches Mongoose, where it
// would throw a CastError. An explicit rule (24 hexadecimal characters) keeps
// the behaviour independent of the Mongoose version.
const OBJECT_ID = /^[0-9a-fA-F]{24}$/;

function validateObjectIdParam(req, res, next, value) {
  if (!OBJECT_ID.test(value)) return res.status(400).json({ error: 'Invalid id' });
  next();
}

module.exports = validateObjectIdParam;