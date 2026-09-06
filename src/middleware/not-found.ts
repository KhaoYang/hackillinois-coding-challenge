import type { RequestHandler } from "express";
import { AppError } from "../errors/app-error.js";

// This is a normal three-argument middleware handler. app.ts registers it after
// all valid routes, so reaching it means no endpoint matched the request.
export const notFoundHandler: RequestHandler = (req, _res, next) => {
  // The underscore documents that the response is intentionally unused here.
  // Passing an AppError to next() transfers control to the error middleware.
  next(
    new AppError(404, "ROUTE_NOT_FOUND", `Cannot ${req.method} ${req.path}`),
  );
};
