// Express 4 does not catch errors thrown inside async route handlers: an
// unhandled rejection can stop the whole Node process, so one bad request
// would take the API down for everyone. This wrapper forwards any error to
// Express' error handler (the central one in app.js, which answers a generic
// 500 without leaking internal details).
module.exports = function asyncHandler(handler) {
    return function handleAsync(req, res, next) {
        return Promise.resolve(handler(req, res, next)).catch(next);
    };
};