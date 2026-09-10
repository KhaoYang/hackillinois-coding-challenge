import { z } from "zod";
import type { RequestSchemas } from "../../middleware/validate-request.js";
import { STAFF_TEAMS } from "../volunteers/volunteer.model.js";
import { SIGNUP_STATUSES } from "./signup.model.js";

export const CANDIDATE_ELIGIBILITIES = [
  "ELIGIBLE",
  "SCHEDULE_CONFLICT",
  "ALREADY_ASSIGNED",
  "SHIFT_NOT_OPEN",
  "SHIFT_ALREADY_STARTED",
  "SHIFT_FULL",
] as const;

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

export const listShiftCandidatesQuerySchema = z
  .object({
    team: z.enum(STAFF_TEAMS).optional(),
    eligibility: z.enum(CANDIDATE_ELIGIBILITIES).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(100),
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

export const listShiftCandidatesRequest = {
  params: shiftSignupParamsSchema,
  query: listShiftCandidatesQuerySchema,
} satisfies RequestSchemas;

export type CandidateEligibility = (typeof CANDIDATE_ELIGIBILITIES)[number];

export type ListShiftCandidatesQuery = z.infer<
  typeof listShiftCandidatesQuerySchema
>;
