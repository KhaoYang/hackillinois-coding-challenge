import type { ErrorRequestHandler } from "express";
import { AppError } from "../errors/app-error.js";

// Express identifies error middleware by its four-parameter signature. Keep
// `_next` even though this final handler does not forward the error again.
export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  // express.json() reports malformed JSON with a SyntaxError carrying status
  // 400 and a body field. Handle it as client input rather than an internal bug.
  if (
    error instanceof SyntaxError &&
    "status" in error &&
    error.status === 400 &&
    "body" in error
  ) {
    res.status(400).json({
      error: {
        code: "MALFORMED_JSON",
        message: "The request body contains malformed JSON",
      },
    });
    return;
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "type" in error &&
    error.type === "entity.too.large"
  ) {
    res.status(413).json({
      error: {
        code: "PAYLOAD_TOO_LARGE",
        message: "The request body exceeds the 100kb limit",
      },
    });
    return;
  }

  // AppError instances are expected failures with status codes and messages
  // that were deliberately chosen to be safe for an API client.
  if (error instanceof AppError) {
    res.status(error.statusCode).json({
      error: {
        code: error.code,
        message: error.message,

        // Add the details property only when details were supplied. This keeps
        // simple error responses concise and avoids serializing undefined.
        ...(error.details !== undefined ? { details: error.details } : {}),
      },
    });

    return;
  }

  // Unknown errors may contain private implementation details. Record the full
  // value on the server for diagnosis, but do not expose it to the client.
  console.error("Unexpected error:", error);

  // Every unexpected failure receives the same generic 500 response shape.
  res.status(500).json({
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: "An unexpected error occurred",
    },
  });
};
