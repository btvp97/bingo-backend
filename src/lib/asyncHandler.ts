import type { NextFunction, Request, Response } from "express";

/**
 * Wraps an async Express route handler so a rejected promise is forwarded to
 * next(err) instead of becoming an unhandled rejection.
 *
 * Express 4 does not do this automatically for async handlers — without this
 * wrapper, any thrown error inside an `async (req, res) => {...}` handler
 * (a database hiccup, a bad query, anything) becomes an unhandled promise
 * rejection, and Node's default behavior for that is to crash the entire
 * process, not just fail the one request.
 */
export function asyncHandler<Req extends Request = Request>(
  handler: (req: Req, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Req, res: Response, next: NextFunction) => {
    handler(req, res, next).catch(next);
  };
}
