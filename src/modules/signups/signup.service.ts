import mongoose, { Types } from "mongoose";
import { AppError } from "../../errors/app-error.js";
import { ShiftModel } from "../shifts/shift.model.js";
import { VolunteerModel } from "../volunteers/volunteer.model.js";
import {
  SignupModel,
  type SignupDocument,
  type SignupStatus,
} from "./signup.model.js";
import type { ListSignupsQuery } from "./signup.schemas.js";

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
