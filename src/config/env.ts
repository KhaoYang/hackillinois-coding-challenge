// Importing dotenv/config has the side effect of loading key/value pairs from
// .env into process.env before we attempt to validate them.
import "dotenv/config";
import { z } from "zod";

// process.env is an untrusted collection of strings and undefined values.
// This schema creates one validated, typed configuration boundary for the app.
const envSchema = z.object({
  // Restrict the application mode to values our code knows how to handle.
  // The default makes local development work when NODE_ENV is omitted.
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  // Environment variables begin as strings. coerce.number() converts a value
  // such as "3000" into 3000 before checking the valid TCP port range.
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),

  // Require a nonempty MongoDB connection string. Mongoose will perform the
  // protocol-specific connection validation when it attempts to connect.
  MONGODB_URI: z.string().trim().min(1, "MONGODB_URI is required"),
});

// safeParse returns a success/error union instead of throwing immediately,
// allowing us to create a concise startup message for all invalid fields.
const result = envSchema.safeParse(process.env);

if (!result.success) {
  // Convert Zod's structured issues into a readable message such as
  // "MONGODB_URI: MONGODB_URI is required".
  const issues = result.error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join(", ");

  // Fail fast: running with incomplete configuration would only cause less
  // understandable errors later when the server tries to use that value.
  throw new Error(`Invalid environment variables: ${issues}`);
}

// After the success check, TypeScript knows result.data is valid. Consumers get
// a number for PORT and a narrow union for NODE_ENV rather than raw strings.
export const env = result.data;
