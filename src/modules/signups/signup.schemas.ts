import { z } from "zod";
import type { RequestSchemas } from "../../middleware/validate-request.js";
import { SIGNUP_STATUSES } from "./signup.model.js";

const objectIdSchema = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, "ID must be a valid MongoDB ObjectId");

export const createSignupBodySchema = z
  .object({
    volunteerId: objectIdSchema,
  })
  .strict();

export const shiftSignupParamsSchema = z
  .object({
    shiftId: objectIdSchema,
  })
  .strict();

export const cancelSignupParamsSchema = z
  .object({
    shiftId: objectIdSchema,
    volunteerId: objectIdSchema,
  })
  .strict();

export const listSignupsQuerySchema = z
  .object({
    status: z.enum(SIGNUP_STATUSES).default("CONFIRMED"),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export const createSignupRequest = {
  params: shiftSignupParamsSchema,
  body: createSignupBodySchema,
} satisfies RequestSchemas;

export const cancelSignupRequest = {
  params: cancelSignupParamsSchema,
} satisfies RequestSchemas;

export const listSignupsRequest = {
  params: shiftSignupParamsSchema,
  query: listSignupsQuerySchema,
} satisfies RequestSchemas;

export type ListSignupsQuery = z.infer<typeof listSignupsQuerySchema>;
