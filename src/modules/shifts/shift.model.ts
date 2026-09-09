import { HydratedDocument, InferSchemaType, model, Schema } from "mongoose";

export const SHIFT_STATUSES = ["DRAFT", "OPEN", "CLOSED", "CANCELLED"] as const;

export type ShiftStatus = (typeof SHIFT_STATUSES)[number];

const shiftSchema = new Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 100,
    },
    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1_000,
    },
    location: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 150,
    },
    startAt: {
      type: Date,
      required: true,
    },
    endAt: {
      type: Date,
      required: true,
    },
    capacity: {
      type: Number,
      required: true,
      min: 1,
      max: 10_000,
    },
    minimumStaff: {
      type: Number,
      required: true,
      default: 1,
      min: 1,
      max: 10_000,
    },
    confirmedCount: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    status: {
      type: String,
      required: true,
      enum: SHIFT_STATUSES,
      default: "DRAFT",
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

// Protect invariants even when code writes through Mongoose without using the
// HTTP validation schemas.
shiftSchema.pre("validate", function () {
  if (this.endAt <= this.startAt) {
    this.invalidate("endAt", "Shift end time must be after its start time");
  }

  if (this.confirmedCount > this.capacity) {
    this.invalidate(
      "capacity",
      "Capacity cannot be lower than the confirmed signup count",
    );
  }

  if (this.minimumStaff > this.capacity) {
    this.invalidate(
      "minimumStaff",
      "Minimum staff cannot be greater than shift capacity",
    );
  }
});

// Supports the primary list query: filter by lifecycle state and order by time.
shiftSchema.index({ status: 1, startAt: 1 });

export type Shift = InferSchemaType<typeof shiftSchema>;
export type ShiftDocument = HydratedDocument<Shift>;

export const ShiftModel = model<Shift>("Shift", shiftSchema);
