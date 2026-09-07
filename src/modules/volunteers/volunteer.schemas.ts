import { z } from "zod";
import type { RequestSchemas } from "../../middleware/validate-request.js";
import { listSignupsQuerySchema } from "../signups/signup.schemas.js";
import { STAFF_TEAMS } from "./volunteer.model.js";

// Validate and normalize the body used to create a volunteer.
export const createVolunteerBodySchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, "Name must contain at least 2 characters")
      .max(50, "Name cannot exceed 50 characters"),

    email: z
      .string()
      .trim()
      .toLowerCase()
      .pipe(
        z.email({
          error: "Email must be valid",
        }),
      ),

    // Phone numbers have many international formats, so we enforce a sensible
    // length without pretending one restrictive regular expression fits all.
    phone: z
      .string()
      .trim()
      .min(7, "Phone number must contain at least 7 characters")
      .max(15, "Phone number cannot exceed 15 characters")
      .optional(),

    team: z.enum(STAFF_TEAMS),

    requiredShiftCount: z.number().int().min(0).max(100).default(0),
  })
  .strict();

// MongoDB ObjectIds are represented by 24 hexadecimal characters in URLs.
export const volunteerParamsSchema = z
  .object({
    volunteerId: z
      .string()
      .regex(
        /^[0-9a-fA-F]{24}$/,
        "Volunteer ID must be a valid MongoDB ObjectId",
      ),
  })
  .strict();

export const listUndercommittedVolunteersQuerySchema = z
  .object({
    team: z.enum(STAFF_TEAMS).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export const listVolunteersQuerySchema = z
  .object({
    team: z.enum(STAFF_TEAMS).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

// Group schemas by route so the validation middleware knows which part of the
// request each schema applies to.
export const createVolunteerRequest = {
  body: createVolunteerBodySchema,
} satisfies RequestSchemas;

export const getVolunteerRequest = {
  params: volunteerParamsSchema,
} satisfies RequestSchemas;

export const listVolunteersRequest = {
  query: listVolunteersQuerySchema,
} satisfies RequestSchemas;

export const listUndercommittedVolunteersRequest = {
  query: listUndercommittedVolunteersQuerySchema,
} satisfies RequestSchemas;

export const listVolunteerSignupsRequest = {
  params: volunteerParamsSchema,
  query: listSignupsQuerySchema,
} satisfies RequestSchemas;

// These types are generated from runtime schemas rather than being maintained
// separately.
export type CreateVolunteerInput = z.infer<typeof createVolunteerBodySchema>;

export type VolunteerParams = z.infer<typeof volunteerParamsSchema>;

export type ListUndercommittedVolunteersQuery = z.infer<
  typeof listUndercommittedVolunteersQuerySchema
>;

export type ListVolunteersQuery = z.infer<typeof listVolunteersQuerySchema>;
