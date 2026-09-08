import { AppError } from "../../errors/app-error.js";
import { SignupModel } from "../signups/signup.model.js";
import type {
  CreateVolunteerInput,
  ListUndercommittedVolunteersQuery,
  ListVolunteersQuery,
} from "./volunteer.schemas.js";
import {
  VolunteerModel,
  type StaffTeam,
  type VolunteerDocument,
} from "./volunteer.model.js";

export interface VolunteerResponse {
  id: string;
  name: string;
  email: string;
  phone?: string;
  team: StaffTeam;
  requiredShiftCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface VolunteerListResponse {
  items: VolunteerResponse[];
  pagination: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
  };
}

function toVolunteerResponse(volunteer: VolunteerDocument): VolunteerResponse {
  return {
    id: volunteer._id.toString(),
    name: volunteer.name,
    email: volunteer.email,
    ...(volunteer.phone != null ? { phone: volunteer.phone } : {}),
    team: volunteer.team,
    requiredShiftCount: volunteer.requiredShiftCount,
    createdAt: volunteer.createdAt.toISOString(),
    updatedAt: volunteer.updatedAt.toISOString(),
  };
}

export interface UndercommittedVolunteerResponse {
  id: string;
  name: string;
  email: string;
  phone?: string;
  team: StaffTeam;
  requiredShiftCount: number;
  confirmedShiftCount: number;
  remainingShiftCount: number;
}

export interface UndercommittedVolunteerListResponse {
  items: UndercommittedVolunteerResponse[];
  pagination: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
  };
}

interface UndercommittedVolunteerRow {
  _id: { toString(): string };
  name: string;
  email: string;
  phone?: string | null;
  team: StaffTeam;
  requiredShiftCount: number;
  confirmedShiftCount: number;
  remainingShiftCount: number;
}

interface UndercommittedVolunteerFacet {
  items: UndercommittedVolunteerRow[];
  metadata: Array<{ totalItems: number }>;
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === 11000
  );
}

export async function createVolunteer(
  input: CreateVolunteerInput,
): Promise<VolunteerResponse> {
  try {
    const volunteer = await VolunteerModel.create(input);
    return toVolunteerResponse(volunteer);
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw new AppError(
        409,
        "EMAIL_ALREADY_REGISTERED",
        "This email is already registered",
      );
    }
    throw error;
  }
}

export async function getVolunteerById(
  volunteerId: string,
): Promise<VolunteerResponse> {
  const volunteer = await VolunteerModel.findById(volunteerId);

  if (!volunteer) {
    throw new AppError(
      404,
      "VOLUNTEER_NOT_FOUND",
      "The requested volunteer does not exist",
    );
  }
  return toVolunteerResponse(volunteer);
}

export async function listVolunteers(
  query: ListVolunteersQuery,
): Promise<VolunteerListResponse> {
  const filter = query.team ? { team: query.team } : {};
  const skip = (query.page - 1) * query.limit;

  const [volunteers, totalItems] = await Promise.all([
    VolunteerModel.find(filter)
      .sort({ name: 1, _id: 1 })
      .skip(skip)
      .limit(query.limit),
    VolunteerModel.countDocuments(filter),
  ]);

  return {
    items: volunteers.map(toVolunteerResponse),
    pagination: {
      page: query.page,
      limit: query.limit,
      totalItems,
      totalPages: Math.ceil(totalItems / query.limit),
    },
  };
}

export async function listUndercommittedVolunteers(
  query: ListUndercommittedVolunteersQuery,
): Promise<UndercommittedVolunteerListResponse> {
  const skip = (query.page - 1) * query.limit;

  const [result] = await VolunteerModel.aggregate<UndercommittedVolunteerFacet>(
    [
      { $match: query.team ? { team: query.team } : {} },
      {
        $lookup: {
          from: SignupModel.collection.name,
          let: { volunteerId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$volunteerId", "$$volunteerId"] },
                    { $eq: ["$status", "CONFIRMED"] },
                  ],
                },
              },
            },
            { $count: "count" },
          ],
          as: "signupStats",
        },
      },
      {
        $set: {
          confirmedShiftCount: {
            $ifNull: [{ $arrayElemAt: ["$signupStats.count", 0] }, 0],
          },
        },
      },
      {
        $match: {
          $expr: { $lt: ["$confirmedShiftCount", "$requiredShiftCount"] },
        },
      },
      {
        $set: {
          remainingShiftCount: {
            $subtract: ["$requiredShiftCount", "$confirmedShiftCount"],
          },
        },
      },
      { $sort: { remainingShiftCount: -1, name: 1, _id: 1 } },
      {
        $facet: {
          items: [
            { $skip: skip },
            { $limit: query.limit },
            {
              $project: {
                signupStats: 0,
                bookingVersion: 0,
                createdAt: 0,
                updatedAt: 0,
              },
            },
          ],
          metadata: [{ $count: "totalItems" }],
        },
      },
    ],
  );

  const rows = result?.items ?? [];
  const totalItems = result?.metadata[0]?.totalItems ?? 0;

  return {
    items: rows.map((volunteer) => ({
      id: volunteer._id.toString(),
      name: volunteer.name,
      email: volunteer.email,
      ...(volunteer.phone != null ? { phone: volunteer.phone } : {}),
      team: volunteer.team,
      requiredShiftCount: volunteer.requiredShiftCount,
      confirmedShiftCount: volunteer.confirmedShiftCount,
      remainingShiftCount: volunteer.remainingShiftCount,
    })),
    pagination: {
      page: query.page,
      limit: query.limit,
      totalItems,
      totalPages: Math.ceil(totalItems / query.limit),
    },
  };
}
