import { HydratedDocument, InferSchemaType, model, Schema } from "mongoose";

export const SIGNUP_STATUSES = ["CONFIRMED", "CANCELLED"] as const;
export type SignupStatus = (typeof SIGNUP_STATUSES)[number];

const signupSchema = new Schema(
  {
    shiftId: {
      type: Schema.Types.ObjectId,
      ref: "Shift",
      required: true,
    },
    volunteerId: {
      type: Schema.Types.ObjectId,
      ref: "Volunteer",
      required: true,
    },
    status: {
      type: String,
      required: true,
      enum: SIGNUP_STATUSES,
      default: "CONFIRMED",
    },
    signedUpAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    cancelledAt: {
      type: Date,
      required: false,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

// One document represents the full lifecycle of one volunteer/shift pair. A
// cancelled volunteer who rejoins updates this document rather than duplicating
// signup history.
signupSchema.index(
  { shiftId: 1, volunteerId: 1 },
  { unique: true, name: "unique_shift_volunteer" },
);
signupSchema.index({ volunteerId: 1, status: 1 });
signupSchema.index({ shiftId: 1, status: 1, signedUpAt: 1 });

export type Signup = InferSchemaType<typeof signupSchema>;
export type SignupDocument = HydratedDocument<Signup>;

export const SignupModel = model<Signup>("Signup", signupSchema);
