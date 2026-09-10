import type { NextFunction, Request, Response } from "express";

// Print one concise line after each response finishes. Request bodies are
// intentionally omitted so staff contact information never reaches the logs.
export function requestLogger(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  // Keep automated test output readable while enabling logs by default for
  // local development and the dashboard demo.
  if (process.env.NODE_ENV === "test") {
    next();
    return;
  }

  const startedAt = performance.now();

  res.once("finish", () => {
    const durationMs = Math.round(performance.now() - startedAt);

    console.info(
      req.method,
      req.originalUrl,
      res.statusCode,
      durationMs + "ms",
    );
  });

  next();
}
