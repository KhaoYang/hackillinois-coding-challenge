import express from "express";
import cors from "cors";
import swaggerUi from "swagger-ui-express";
import { openApiDocument } from "./docs/openapi.js";
import { errorHandler } from "./middleware/error-handler.js";
import { notFoundHandler } from "./middleware/not-found.js";
import { requestLogger } from "./middleware/request-logger.js";
import shiftRouter from "./modules/shifts/shift.routes.js";
import signupRouter from "./modules/signups/signup.routes.js";
import volunteerRouter from "./modules/volunteers/volunteer.routes.js";
// Create and configure the Express application without starting an HTTP server.
// Keeping configuration separate from app.listen() lets tests import this app
// and send requests to it without opening a real network port.
const app = express();

// Avoid advertising the framework in every response header.
app.disable("x-powered-by");

// Add CORS response headers so browser clients hosted on another origin can
// call this API. With no options, all origins are allowed; a production API
// could replace this with an explicit allowlist.
app.use(cors());

// Log the HTTP method, URL, status code, and duration for each completed
// request. Registering this before the body parser also captures malformed
// JSON responses without logging the potentially sensitive request body.
app.use(requestLogger);

// Parse requests whose Content-Type is application/json. The parsed value is
// placed on req.body for later validation by our Zod middleware.
app.use(express.json({ limit: "100kb" }));

// A lightweight liveness endpoint. It proves the Express process is running;
// it does not perform another database query on every health check.
app.get("/health", (_req, res) => {
  res.json({
    data: {
      status: "ok",
    },
  });
});

// Expose both a machine-readable OpenAPI document and an interactive browser
// client. Swagger UI's "Try it out" button sends requests to this same server.
app.get("/api-docs.json", (_req, res) => {
  res.json(openApiDocument);
});
app.use(
  "/api-docs",
  swaggerUi.serve,
  swaggerUi.setup(openApiDocument, {
    customSiteTitle: "HackIllinois Staff Shift API",
    swaggerOptions: {
      persistAuthorization: true,
      displayRequestDuration: true,
    },
  }),
);

app.use("/api/v1/volunteers", volunteerRouter);
app.use("/api/v1/shifts/:shiftId/signups", signupRouter);
app.use("/api/v1/shifts", shiftRouter);

// This handler must be registered after every real route. Express reaches it
// only when none of the routes above matched the incoming request.
app.use(notFoundHandler);

// Error middleware belongs last so it can format errors passed by any earlier
// route or middleware into the API's consistent JSON error shape.
app.use(errorHandler);

// Export the configured app for server startup and integration tests.
export default app;
