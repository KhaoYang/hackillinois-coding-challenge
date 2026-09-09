import mongoose, { type QueryFilter } from "mongoose";
import { AppError } from "../../errors/app-error.js";
import { SignupModel } from "../signups/signup.model.js";
import { ShiftModel, type Shift, type ShiftStatus } from "./shift.model.js";
import type {
  CreateShiftInput,
  ListShiftsQuery,
  UnderstaffedShiftsQuery,
  UpdateShiftInput,
} from "./shift.schemas.js";

export interface ShiftResponse {
  id: string;
  title: string;
  description: string;
  location: string;
  startAt: string;
  endAt: string;
  capacity: number;
  minimumStaff: number;
  confirmedCount: number;
  spotsRemaining: number;
  staffNeeded: number;
  status: ShiftStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ShiftListResponse {
  items: ShiftResponse[];
  pagination: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
  };
}

interface ShiftResponseSource {
  _id: mongoose.Types.ObjectId;
  title: string;
  description: string;
  location: string;
  startAt: Date;
  endAt: Date;
  capacity: number;
  minimumStaff: number;
  confirmedCount: number;
  status: ShiftStatus;
  createdAt: Date;
  updatedAt: Date;
}

interface UnderstaffedFacet {
  items: ShiftResponseSource[];
  metadata: Array<{ totalItems: number }>;
}

const allowedTransitions: Record<ShiftStatus, readonly ShiftStatus[]> = {
  DRAFT: ["DRAFT", "OPEN", "CANCELLED"],
  OPEN: ["OPEN", "CLOSED", "CANCELLED"],
  CLOSED: ["CLOSED", "CANCELLED"],
  CANCELLED: ["CANCELLED"],
};

function toShiftResponse(shift: ShiftResponseSource): ShiftResponse {
  const minimumStaff = shift.minimumStaff ?? 1;

  return {
    id: shift._id.toString(),
    title: shift.title,
    description: shift.description,
    location: shift.location,
    startAt: shift.startAt.toISOString(),
    endAt: shift.endAt.toISOString(),
    capacity: shift.capacity,
    minimumStaff,
    confirmedCount: shift.confirmedCount,
    spotsRemaining: Math.max(shift.capacity - shift.confirmedCount, 0),
    staffNeeded: Math.max(minimumStaff - shift.confirmedCount, 0),
    status: shift.status,
    createdAt: shift.createdAt.toISOString(),
    updatedAt: shift.updatedAt.toISOString(),
  };
}

function assertOpenTimeIsValid(status: ShiftStatus, startAt: Date): void {
  if (status === "OPEN" && startAt <= new Date()) {
    throw new AppError(
      409,
      "SHIFT_ALREADY_STARTED",
      "An open shift must start in the future",
    );
  }
}

export async function createShift(
  input: CreateShiftInput,
): Promise<ShiftResponse> {
  assertOpenTimeIsValid(input.status, input.startAt);

  const shift = await ShiftModel.create(input);
  return toShiftResponse(shift);
}

export async function getShiftById(shiftId: string): Promise<ShiftResponse> {
  const shift = await ShiftModel.findById(shiftId);

  if (!shift) {
    throw new AppError(
      404,
      "SHIFT_NOT_FOUND",
      "The requested shift does not exist",
    );
  }

  return toShiftResponse(shift);
}

export async function listShifts(
  query: ListShiftsQuery,
): Promise<ShiftListResponse> {
  const filter: QueryFilter<Shift> = {};

  if (query.status) {
    filter.status = query.status;
  }

  // Return shifts that intersect the requested time window, rather than only
  // shifts whose start time happens to fall inside it.
  if (query.from) {
    filter.endAt = { $gt: query.from };
  }

  if (query.to) {
    filter.startAt = { $lt: query.to };
  }

  const skip = (query.page - 1) * query.limit;

  const [shifts, totalItems] = await Promise.all([
    ShiftModel.find(filter)
      .sort({ startAt: 1, _id: 1 })
      .skip(skip)
      .limit(query.limit),
    ShiftModel.countDocuments(filter),
  ]);

  return {
    items: shifts.map(toShiftResponse),
    pagination: {
      page: query.page,
      limit: query.limit,
      totalItems,
      totalPages: Math.ceil(totalItems / query.limit),
    },
  };
}

export async function listUnderstaffedShifts(
  query: UnderstaffedShiftsQuery,
): Promise<ShiftListResponse> {
  const now = new Date();
  const startAt: Record<string, Date> = { $gt: now };

  if (query.to) {
    startAt.$lt = query.to;
  }

  const match: Record<string, unknown> = {
    status: "OPEN",
    startAt,
  };

  if (query.from) {
    match.endAt = { $gt: query.from };
  }

  const skip = (query.page - 1) * query.limit;

  // Larger gaps appear first so organizers can address the most urgent
  // staffing needs before moving down the event schedule.
  const [result] = await ShiftModel.aggregate<UnderstaffedFacet>([
    { $match: match },
    {
      $set: {
        // The fallback makes the endpoint safe for records created before the
        // minimumStaff field was introduced.
        minimumStaff: { $ifNull: ["$minimumStaff", 1] },
        staffNeeded: {
          $subtract: [{ $ifNull: ["$minimumStaff", 1] }, "$confirmedCount"],
        },
      },
    },
    { $match: { staffNeeded: { $gt: 0 } } },
    { $sort: { staffNeeded: -1, startAt: 1, _id: 1 } },
    {
      $facet: {
        items: [{ $skip: skip }, { $limit: query.limit }],
        metadata: [{ $count: "totalItems" }],
      },
    },
  ]);

  const items = result?.items ?? [];
  const totalItems = result?.metadata[0]?.totalItems ?? 0;

  return {
    items: items.map(toShiftResponse),
    pagination: {
      page: query.page,
      limit: query.limit,
      totalItems,
      totalPages: Math.ceil(totalItems / query.limit),
    },
  };
}

export async function updateShift(
  shiftId: string,
  input: UpdateShiftInput,
): Promise<ShiftResponse> {
  return mongoose.connection.transaction(async (session) => {
    const shift = await ShiftModel.findById(shiftId).session(session);

    if (!shift) {
      throw new AppError(
        404,
        "SHIFT_NOT_FOUND",
        "The requested shift does not exist",
      );
    }

    if (
      shift.status === "CANCELLED" &&
      (Object.keys(input).length !== 1 || input.status !== "CANCELLED")
    ) {
      throw new AppError(
        409,
        "SHIFT_CANCELLED",
        "A cancelled shift cannot be modified",
      );
    }

    const previousStatus = shift.status;
    const nextStatus = input.status ?? previousStatus;

    if (!allowedTransitions[shift.status].includes(nextStatus)) {
      throw new AppError(
        409,
        "INVALID_SHIFT_TRANSITION",
        `A ${shift.status} shift cannot transition to ${nextStatus}`,
      );
    }

    const changesTime =
      input.startAt !== undefined || input.endAt !== undefined;

    if (changesTime && shift.confirmedCount > 0) {
      throw new AppError(
        409,
        "SHIFT_TIME_LOCKED",
        "Shift times cannot change while confirmed signups exist",
      );
    }

    const nextStartAt = input.startAt ?? shift.startAt;
    const nextEndAt = input.endAt ?? shift.endAt;
    const nextCapacity = input.capacity ?? shift.capacity;
    const nextMinimumStaff = input.minimumStaff ?? shift.minimumStaff;

    if (nextEndAt <= nextStartAt) {
      throw new AppError(
        409,
        "INVALID_SHIFT_TIME",
        "Shift end time must be after its start time",
      );
    }

    if (nextCapacity < shift.confirmedCount) {
      throw new AppError(
        409,
        "CAPACITY_BELOW_SIGNUPS",
        "Capacity cannot be lower than the confirmed signup count",
      );
    }

    if (nextMinimumStaff > nextCapacity) {
      throw new AppError(
        409,
        "MINIMUM_STAFF_EXCEEDS_CAPACITY",
        "Minimum staff cannot be greater than shift capacity",
      );
    }

    // Validate the future-start rule when a shift is being opened or when the
    // start time of an already open shift is explicitly changed.
    if (
      nextStatus === "OPEN" &&
      (previousStatus !== "OPEN" || input.startAt !== undefined)
    ) {
      assertOpenTimeIsValid(nextStatus, nextStartAt);
    }

    shift.set(input);

    if (nextStatus === "CANCELLED" && previousStatus !== "CANCELLED") {
      const cancelledAt = new Date();

      await SignupModel.updateMany(
        { shiftId: shift._id, status: "CONFIRMED" },
        { $set: { status: "CANCELLED", cancelledAt } },
        { session },
      );

      shift.confirmedCount = 0;
    }

    await shift.save({ session });
    return toShiftResponse(shift);
  });
}

export async function deleteShift(shiftId: string): Promise<void> {
  const deleted = await ShiftModel.findOneAndDelete({
    _id: shiftId,
    status: "DRAFT",
    confirmedCount: 0,
  });

  if (deleted) {
    return;
  }

  const exists = await ShiftModel.exists({ _id: shiftId });

  if (!exists) {
    throw new AppError(
      404,
      "SHIFT_NOT_FOUND",
      "The requested shift does not exist",
    );
  }

  throw new AppError(
    409,
    "SHIFT_CANNOT_BE_DELETED",
    "Only an unused draft shift can be deleted; cancel other shifts instead",
  );
}
