// `import type` provides TypeScript information without adding a runtime import
// to the compiled JavaScript.
import type { RequestHandler, Response } from "express";
import { z } from "zod";
import { AppError } from "../errors/app-error.js";

// These are the three untrusted request locations that route schemas may check.
type RequestPart = "body" | "params" | "query";

// Record maps every RequestPart to a possible Zod schema. Partial makes each
// schema optional because, for example, a GET route may not accept a body.
export type RequestSchemas = Partial<Record<RequestPart, z.ZodType>>;

// This mapped type walks over the schemas supplied for one route and uses
// z.infer to calculate the TypeScript type produced by each schema.
export type ValidatedRequest<T extends RequestSchemas> = {
  [K in keyof T]: T[K] extends z.ZodType ? z.infer<T[K]> : never;
};

// Return Express middleware configured with the schemas for one route. This is
// a middleware factory: calling validateRequest() builds the actual handler.
export function validateRequest(schemas: RequestSchemas): RequestHandler {
  return (req, res, next) => {
    // Take a snapshot of the original Express inputs. They have not yet been
    // proven safe and should not be used by business logic in this form.
    const requestInput = {
      body: req.body,
      params: req.params,
      query: req.query,
    };

    // Build a separate object containing only values successfully parsed by
    // Zod. `unknown` is appropriate until a route retrieves its inferred type.
    const validated: Partial<Record<RequestPart, unknown>> = {};

    // Validate every schema that the current route supplied. `as const` keeps
    // each item typed as the specific RequestPart union instead of plain string.
    for (const part of ["params", "query", "body"] as const) {
      const schema = schemas[part];

      // Missing schemas are intentional, so skip that request location.
      if (!schema) {
        continue;
      }

      // safeParse both validates and applies schema transformations/coercions.
      const result = schema.safeParse(requestInput[part]);

      if (!result.success) {
        // Normalize Zod issues into a stable API representation. Prefixing the
        // path with its request part produces paths such as "body.email".
        const details = result.error.issues.map((issue) => ({
          code: issue.code,
          path: [part, ...issue.path.map(String)].join("."),
          message: issue.message,
        }));

        // Pass the error forward instead of responding here. The central error
        // handler owns response formatting for the whole application.
        next(
          new AppError(
            400,
            "VALIDATION_ERROR",
            "The request contains invalid data",
            details,
          ),
        );

        // Stop this middleware so invalid input cannot reach the controller.
        return;
      }

      // Store result.data, not the original input, so defaults, trimming, and
      // coercion performed by Zod are preserved for the controller.
      validated[part] = result.data;
    }

    // res.locals is scoped to this request. It avoids mutating req.query, which
    // Express 5 exposes through a getter, and passes safe data downstream.
    res.locals.validated = validated;

    // Continue to the next middleware or the route's controller.
    next();
  };
}

// Recover the compile-time types inferred from a route's schema object. The
// cast is safe when this is called after validateRequest() for the same schemas.
export function getValidatedRequest<T extends RequestSchemas>(
  res: Response,
): ValidatedRequest<T> {
  return res.locals.validated as ValidatedRequest<T>;
}
