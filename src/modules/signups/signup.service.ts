import mongoose, { Types } from "mongoose";
import { AppError } from "../../errors/app-error.js";
import { ShiftModel } from "../shifts/shift.model.js";
import { VolunteerModel } from "../volunteers/volunteer.model.js";
import {
  SignupModel,
  type SignupDocument,
  type SignupStatus,
} from "./signup.model.js";
import type {
  CandidateEligibility,
  ListShiftCandidatesQuery,
  ListSignupsQuery,
} from "./signup.schemas.js";

export interface SignupResponse {
  id: string;
  shiftId: string;
  volunteerId: string;
  status: SignupStatus;
  signedUpAt: string;
  cancelledAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SignupResult {
  signup: SignupResponse;
  created: boolean;
}

export interface SignupListResponse {
  items: SignupResponse[];
  pagination: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
  };
}

export interface CandidateConflictResponse {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
}

export interface ShiftCandidateResponse {
  id: string;
  name: string;
  email: string;
  phone?: string;
  team: import("../volunteers/volunteer.model.js").StaffTeam;
  requiredShiftCount: number;
  confirmedShiftCount: number;
  remainingShiftCount: number;
  eligibility: CandidateEligibility;
  reason?: string;
  conflictingShift?: CandidateConflictResponse;
}

export interface ShiftCandidateListResponse {
  items: ShiftCandidateResponse[];
  pagination: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
  };
}

function toSignupResponse(signup: SignupDocument): SignupResponse {
  return {
    id: signup._id.toString(),
    shiftId: signup.shiftId.toString(),
    volunteerId: signup.volunteerId.toString(),
    status: signup.status,
    signedUpAt: signup.signedUpAt.toISOString(),
    ...(signup.cancelledAt != null
      ? { cancelledAt: signup.cancelledAt.toISOString() }
      : {}),
    createdAt: signup.createdAt.toISOString(),
    updatedAt: signup.updatedAt.toISOString(),
  };
}

export async function signupVolunteer(
  shiftId: string,
  volunteerId: string,
): Promise<SignupResult> {
  return mongoose.connection.transaction(async (session) => {
    // Updating one stable volunteer document creates a write conflict between
    // simultaneous schedule changes for that volunteer. MongoDB retries one
    // transaction with a fresh snapshot, preventing overlap write skew.
    const volunteer = await VolunteerModel.findByIdAndUpdate(
      volunteerId,
      { $inc: { bookingVersion: 1 } },
      { returnDocument: "after", session },
    ).select("_id");

    if (!volunteer) {
      throw new AppError(
        404,
        "VOLUNTEER_NOT_FOUND",
        "The requested volunteer does not exist",
      );
    }

    const shift = await ShiftModel.findById(shiftId).session(session);

    if (!shift) {
      throw new AppError(
        404,
        "SHIFT_NOT_FOUND",
        "The requested shift does not exist",
      );
    }

    const existingSignup = await SignupModel.findOne({
      shiftId: shift._id,
      volunteerId: volunteer._id,
    }).session(session);

    // Treat a repeated POST as an idempotent success.
    if (existingSignup?.status === "CONFIRMED") {
      return {
        signup: toSignupResponse(existingSignup),
        created: false,
      };
    }

    if (shift.status !== "OPEN") {
      throw new AppError(
        409,
        "SHIFT_NOT_OPEN",
        "Only an open shift accepts signups",
      );
    }

    if (shift.startAt <= new Date()) {
      throw new AppError(
        409,
        "SHIFT_ALREADY_STARTED",
        "A volunteer cannot join a shift that has already started",
      );
    }

    const confirmedSignups = await SignupModel.find(
      {
        volunteerId: volunteer._id,
        status: "CONFIRMED",
        shiftId: { $ne: shift._id },
      },
      { shiftId: 1 },
      { session },
    );

    const confirmedShiftIds = confirmedSignups.map((signup) => signup.shiftId);

    if (confirmedShiftIds.length > 0) {
      const conflict = await ShiftModel.exists({
        _id: { $in: confirmedShiftIds },
        status: { $ne: "CANCELLED" },
        startAt: { $lt: shift.endAt },
        endAt: { $gt: shift.startAt },
      }).session(session);

      if (conflict) {
        throw new AppError(
          409,
          "SHIFT_TIME_CONFLICT",
          "The volunteer already has a confirmed shift during this time",
        );
      }
    }

    // The comparison and increment happen in one database write. Concurrent
    // requests cannot both claim the final available position.
    const capacityUpdate = await ShiftModel.updateOne(
      {
        _id: shift._id,
        status: "OPEN",
        $expr: { $lt: ["$confirmedCount", "$capacity"] },
      },
      { $inc: { confirmedCount: 1 } },
      { session },
    );

    if (capacityUpdate.modifiedCount !== 1) {
      throw new AppError(409, "SHIFT_FULL", "This shift has reached capacity");
    }

    if (existingSignup) {
      existingSignup.status = "CONFIRMED";
      existingSignup.signedUpAt = new Date();
      existingSignup.cancelledAt = undefined;
      await existingSignup.save({ session });

      return {
        signup: toSignupResponse(existingSignup),
        created: false,
      };
    }

    const [signup] = await SignupModel.create(
      [
        {
          shiftId: shift._id,
          volunteerId: volunteer._id,
          status: "CONFIRMED",
        },
      ],
      { session },
    );

    if (!signup) {
      throw new AppError(
        500,
        "SIGNUP_CREATION_FAILED",
        "The signup could not be created",
      );
    }

    return {
      signup: toSignupResponse(signup),
      created: true,
    };
  });
}

export async function cancelSignup(
  shiftId: string,
  volunteerId: string,
): Promise<void> {
  await mongoose.connection.transaction(async (session) => {
    const volunteer = await VolunteerModel.findByIdAndUpdate(
      volunteerId,
      { $inc: { bookingVersion: 1 } },
      { returnDocument: "after", session },
    ).select("_id");

    if (!volunteer) {
      throw new AppError(
        404,
        "VOLUNTEER_NOT_FOUND",
        "The requested volunteer does not exist",
      );
    }

    const shift = await ShiftModel.findById(shiftId).session(session);

    if (!shift) {
      throw new AppError(
        404,
        "SHIFT_NOT_FOUND",
        "The requested shift does not exist",
      );
    }

    const signup = await SignupModel.findOne({
      shiftId: shift._id,
      volunteerId: volunteer._id,
    }).session(session);

    if (!signup) {
      throw new AppError(
        404,
        "SIGNUP_NOT_FOUND",
        "The requested signup does not exist",
      );
    }

    // DELETE is idempotent: repeating a completed cancellation succeeds
    // without decrementing capacity a second time.
    if (signup.status === "CANCELLED") {
      return;
    }

    signup.status = "CANCELLED";
    signup.cancelledAt = new Date();
    await signup.save({ session });

    const countUpdate = await ShiftModel.updateOne(
      { _id: shift._id, confirmedCount: { $gt: 0 } },
      { $inc: { confirmedCount: -1 } },
      { session },
    );

    if (countUpdate.modifiedCount !== 1) {
      throw new AppError(
        500,
        "SIGNUP_COUNT_INCONSISTENT",
        "The shift signup count is inconsistent",
      );
    }
  });
}

export async function listShiftCandidates(
  shiftId: string,
  query: ListShiftCandidatesQuery,
): Promise<ShiftCandidateListResponse> {
  const shift = await ShiftModel.findById(shiftId).lean();

  if (!shift) {
    throw new AppError(
      404,
      "SHIFT_NOT_FOUND",
      "The requested shift does not exist",
    );
  }

  // Load candidates and assignments in sets. This avoids issuing one
  // availability query per volunteer as the staff roster grows.
  const volunteers = await VolunteerModel.find(
    query.team ? { team: query.team } : {},
  )
    .sort({ name: 1, _id: 1 })
    .lean();
  const volunteerIds = volunteers.map((volunteer) => volunteer._id);
  const confirmedSignups = await SignupModel.find({
    volunteerId: { $in: volunteerIds },
    status: "CONFIRMED",
  })
    .select({ volunteerId: 1, shiftId: 1 })
    .lean();

  const assignedShiftIds = [
    ...new Set(confirmedSignups.map((signup) => signup.shiftId.toString())),
  ].map((assignedShiftId) => new Types.ObjectId(assignedShiftId));
  const assignedShifts = await ShiftModel.find({
    _id: { $in: assignedShiftIds },
    status: { $ne: "CANCELLED" },
  })
    .select({ title: 1, startAt: 1, endAt: 1 })
    .sort({ startAt: 1, _id: 1 })
    .lean();

  const assignedShiftById = new Map(
    assignedShifts.map((assignedShift) => [
      assignedShift._id.toString(),
      assignedShift,
    ]),
  );
  const signupsByVolunteer = new Map<string, typeof confirmedSignups>();

  for (const signup of confirmedSignups) {
    const volunteerId = signup.volunteerId.toString();
    const current = signupsByVolunteer.get(volunteerId) ?? [];
    current.push(signup);
    signupsByVolunteer.set(volunteerId, current);
  }

  const now = new Date();
  const candidates: ShiftCandidateResponse[] = volunteers.map((volunteer) => {
    const volunteerSignups =
      signupsByVolunteer.get(volunteer._id.toString()) ?? [];
    const confirmedShiftCount = volunteerSignups.length;
    const remainingShiftCount = Math.max(
      volunteer.requiredShiftCount - confirmedShiftCount,
      0,
    );
    let eligibility: CandidateEligibility = "ELIGIBLE";
    let reason: string | undefined;
    let conflictingShift: CandidateConflictResponse | undefined;

    if (
      volunteerSignups.some(
        (signup) => signup.shiftId.toString() === shift._id.toString(),
      )
    ) {
      eligibility = "ALREADY_ASSIGNED";
      reason = "Already assigned to this shift";
    } else if (shift.status !== "OPEN") {
      eligibility = "SHIFT_NOT_OPEN";
      reason = "This shift is not open for signups";
    } else if (shift.startAt <= now) {
      eligibility = "SHIFT_ALREADY_STARTED";
      reason = "This shift has already started";
    } else if (shift.confirmedCount >= shift.capacity) {
      eligibility = "SHIFT_FULL";
      reason = "This shift has reached capacity";
    } else {
      const conflict = volunteerSignups
        .map((signup) => assignedShiftById.get(signup.shiftId.toString()))
        .find(
          (assignedShift) =>
            assignedShift !== undefined &&
            assignedShift._id.toString() !== shift._id.toString() &&
            assignedShift.startAt < shift.endAt &&
            assignedShift.endAt > shift.startAt,
        );

      if (conflict) {
        eligibility = "SCHEDULE_CONFLICT";
        reason = "Overlaps with " + conflict.title;
        conflictingShift = {
          id: conflict._id.toString(),
          title: conflict.title,
          startAt: conflict.startAt.toISOString(),
          endAt: conflict.endAt.toISOString(),
        };
      }
    }

    return {
      id: volunteer._id.toString(),
      name: volunteer.name,
      email: volunteer.email,
      ...(volunteer.phone != null ? { phone: volunteer.phone } : {}),
      team: volunteer.team,
      requiredShiftCount: volunteer.requiredShiftCount,
      confirmedShiftCount,
      remainingShiftCount,
      eligibility,
      ...(reason ? { reason } : {}),
      ...(conflictingShift ? { conflictingShift } : {}),
    };
  });

  const eligibilityOrder: Record<CandidateEligibility, number> = {
    ELIGIBLE: 0,
    SCHEDULE_CONFLICT: 1,
    ALREADY_ASSIGNED: 2,
    SHIFT_FULL: 3,
    SHIFT_NOT_OPEN: 4,
    SHIFT_ALREADY_STARTED: 5,
  };
  const filteredCandidates = query.eligibility
    ? candidates.filter(
        (candidate) => candidate.eligibility === query.eligibility,
      )
    : candidates;

  filteredCandidates.sort(
    (first, second) =>
      eligibilityOrder[first.eligibility] -
        eligibilityOrder[second.eligibility] ||
      second.remainingShiftCount - first.remainingShiftCount ||
      first.name.localeCompare(second.name) ||
      first.id.localeCompare(second.id),
  );

  const totalItems = filteredCandidates.length;
  const skip = (query.page - 1) * query.limit;

  return {
    items: filteredCandidates.slice(skip, skip + query.limit),
    pagination: {
      page: query.page,
      limit: query.limit,
      totalItems,
      totalPages: Math.ceil(totalItems / query.limit),
    },
  };
}

export async function listShiftSignups(
  shiftId: string,
  query: ListSignupsQuery,
): Promise<SignupListResponse> {
  const shiftObjectId = new Types.ObjectId(shiftId);
  const shiftExists = await ShiftModel.exists({ _id: shiftObjectId });

  if (!shiftExists) {
    throw new AppError(
      404,
      "SHIFT_NOT_FOUND",
      "The requested shift does not exist",
    );
  }

  const filter = {
    shiftId: shiftObjectId,
    status: query.status,
  };
  const skip = (query.page - 1) * query.limit;

  const [signups, totalItems] = await Promise.all([
    SignupModel.find(filter)
      .sort({ signedUpAt: 1, _id: 1 })
      .skip(skip)
      .limit(query.limit),
    SignupModel.countDocuments(filter),
  ]);

  return {
    items: signups.map(toSignupResponse),
    pagination: {
      page: query.page,
      limit: query.limit,
      totalItems,
      totalPages: Math.ceil(totalItems / query.limit),
    },
  };
}

export async function listVolunteerSignups(
  volunteerId: string,
  query: ListSignupsQuery,
): Promise<SignupListResponse> {
  const volunteerObjectId = new Types.ObjectId(volunteerId);
  const volunteerExists = await VolunteerModel.exists({
    _id: volunteerObjectId,
  });

  if (!volunteerExists) {
    throw new AppError(
      404,
      "VOLUNTEER_NOT_FOUND",
      "The requested volunteer does not exist",
    );
  }

  const filter = {
    volunteerId: volunteerObjectId,
    status: query.status,
  };
  const skip = (query.page - 1) * query.limit;

  const [signups, totalItems] = await Promise.all([
    SignupModel.find(filter)
      .sort({ signedUpAt: -1, _id: -1 })
      .skip(skip)
      .limit(query.limit),
    SignupModel.countDocuments(filter),
  ]);

  return {
    items: signups.map(toSignupResponse),
    pagination: {
      page: query.page,
      limit: query.limit,
      totalItems,
      totalPages: Math.ceil(totalItems / query.limit),
    },
  };
}
