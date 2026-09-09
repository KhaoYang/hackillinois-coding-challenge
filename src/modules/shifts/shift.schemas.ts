import { z } from "zod";
import type { RequestSchemas } from "../../middleware/validate-request.js";
import { SHIFT_STATUSES } from "./shift.model.js";

const objectIdSchema = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, "ID must be a valid MongoDB ObjectId");

const dateTimeSchema = z.iso
  .datetime({ offset: true })
  .transform((value) => new Date(value));

const titleSchema = z.string().trim().min(2).max(100);
const descriptionSchema = z.string().trim().min(1).max(1_000);
const locationSchema = z.string().trim().min(2).max(150);
const capacitySchema = z.number().int().min(1).max(10_000);
const minimumStaffSchema = z.number().int().min(1).max(10_000);

export const shiftStatusSchema = z.enum(SHIFT_STATUSES);

export const createShiftBodySchema = z
  .object({
    title: titleSchema,
    description: descriptionSchema,
    location: locationSchema,
    startAt: dateTimeSchema,
    endAt: dateTimeSchema,
    capacity: capacitySchema,
    minimumStaff: minimumStaffSchema.default(1),
    status: z.enum(["DRAFT", "OPEN"]).default("DRAFT"),
  })
  .strict()
  .superRefine((shift, context) => {
    if (shift.endAt <= shift.startAt) {
      context.addIssue({
        code: "custom",
        path: ["endAt"],
        message: "Shift end time must be after its start time",
      });
    }

    if (shift.minimumStaff > shift.capacity) {
      context.addIssue({
        code: "custom",
        path: ["minimumStaff"],
        message: "Minimum staff cannot be greater than shift capacity",
      });
    }
  });

export const updateShiftBodySchema = z
  .object({
    title: titleSchema.optional(),
    description: descriptionSchema.optional(),
    location: locationSchema.optional(),
    startAt: dateTimeSchema.optional(),
    endAt: dateTimeSchema.optional(),
    capacity: capacitySchema.optional(),
    minimumStaff: minimumStaffSchema.optional(),
    status: shiftStatusSchema.optional(),
  })
  .strict()
  .refine((update) => Object.keys(update).length > 0, {
    message: "At least one field must be supplied",
  })
  .superRefine((update, context) => {
    if (
      update.startAt !== undefined &&
      update.endAt !== undefined &&
      update.endAt <= update.startAt
    ) {
      context.addIssue({
        code: "custom",
        path: ["endAt"],
        message: "Shift end time must be after its start time",
      });
    }

    if (
      update.minimumStaff !== undefined &&
      update.capacity !== undefined &&
      update.minimumStaff > update.capacity
    ) {
      context.addIssue({
        code: "custom",
        path: ["minimumStaff"],
        message: "Minimum staff cannot be greater than shift capacity",
      });
    }
  });

export const shiftParamsSchema = z
  .object({
    shiftId: objectIdSchema,
  })
  .strict();

export const listShiftsQuerySchema = z
  .object({
    status: shiftStatusSchema.optional(),
    from: dateTimeSchema.optional(),
    to: dateTimeSchema.optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict()
  .superRefine((query, context) => {
    if (query.from && query.to && query.to <= query.from) {
      context.addIssue({
        code: "custom",
        path: ["to"],
        message: "The to timestamp must be after the from timestamp",
      });
    }
  });

export const understaffedShiftsQuerySchema = z
  .object({
    from: dateTimeSchema.optional(),
    to: dateTimeSchema.optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict()
  .superRefine((query, context) => {
    if (query.from && query.to && query.to <= query.from) {
      context.addIssue({
        code: "custom",
        path: ["to"],
        message: "The to timestamp must be after the from timestamp",
      });
    }
  });

export const createShiftRequest = {
  body: createShiftBodySchema,
} satisfies RequestSchemas;

export const getShiftRequest = {
  params: shiftParamsSchema,
} satisfies RequestSchemas;

export const listShiftsRequest = {
  query: listShiftsQuerySchema,
} satisfies RequestSchemas;

export const understaffedShiftsRequest = {
  query: understaffedShiftsQuerySchema,
} satisfies RequestSchemas;

export const updateShiftRequest = {
  params: shiftParamsSchema,
  body: updateShiftBodySchema,
} satisfies RequestSchemas;

export const deleteShiftRequest = {
  params: shiftParamsSchema,
} satisfies RequestSchemas;

export type CreateShiftInput = z.infer<typeof createShiftBodySchema>;
export type UpdateShiftInput = z.infer<typeof updateShiftBodySchema>;
export type ListShiftsQuery = z.infer<typeof listShiftsQuerySchema>;
export type UnderstaffedShiftsQuery = z.infer<
  typeof understaffedShiftsQuerySchema
>;
