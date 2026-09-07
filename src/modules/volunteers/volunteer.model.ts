import { HydratedDocument, InferSchemaType, model, Schema } from "mongoose";

export const STAFF_TEAMS = [
  "EXPERIENCE",
  "OUTREACH",
  "SYSTEMS",
  "DESIGN",
] as const;

export type StaffTeam = (typeof STAFF_TEAMS)[number];

//defines the Volunteer schema: {name, email, phone, version}
const volunteerSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 50,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    phone: {
      type: String,
      required: false,
      trim: true,
      minlength: 7,
      maxlength: 15,
    },

    // Team membership supports organization and reporting; it does not limit
    // which shifts a staff member may choose.
    team: {
      type: String,
      required: true,
      enum: STAFF_TEAMS,
    },

    // Event organizers can assign different minimum commitments to different
    // staff members. Zero means the volunteer has no required shift count.
    requiredShiftCount: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
      max: 100,
      validate: {
        validator: Number.isInteger,
        message: "Required shift count must be an integer",
      },
    },

    bookingVersion: {
      type: Number,
      required: true,
      default: 0,
      select: false,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

volunteerSchema.index(
  { email: 1 },
  {
    unique: true,
    name: "unique_email",
  },
);
volunteerSchema.index({ team: 1 });

export type Volunteer = InferSchemaType<typeof volunteerSchema>;

export type VolunteerDocument = HydratedDocument<Volunteer>;

export const VolunteerModel = model<Volunteer>("Volunteer", volunteerSchema);
