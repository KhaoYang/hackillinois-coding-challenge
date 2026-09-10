import { Types } from "mongoose";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import app from "../src/app.js";
import { ShiftModel } from "../src/modules/shifts/shift.model.js";
import { SignupModel } from "../src/modules/signups/signup.model.js";
import { VolunteerModel } from "../src/modules/volunteers/volunteer.model.js";
import {
  clearTestDatabase,
  startTestDatabase,
  stopTestDatabase,
} from "./helpers/database.js";

function hoursFromNow(hours: number): Date {
  return new Date(Date.now() + hours * 60 * 60 * 1_000);
}

async function createVolunteer(sequence = 1) {
  return VolunteerModel.create({
    name: `Volunteer ${sequence}`,
    email: `volunteer${sequence}@example.com`,
    team: "SYSTEMS",
  });
}

async function createOpenShift(options?: {
  capacity?: number;
  startAt?: Date;
  endAt?: Date;
  title?: string;
}) {
  return ShiftModel.create({
    title: options?.title ?? "Food Service",
    description: "Serve meals to participants",
    location: "Dining Hall",
    startAt: options?.startAt ?? hoursFromNow(2),
    endAt: options?.endAt ?? hoursFromNow(4),
    capacity: options?.capacity ?? 3,
    status: "OPEN",
  });
}

describe("Signup routes", () => {
  beforeAll(async () => {
    await startTestDatabase();
    await VolunteerModel.syncIndexes();
    await ShiftModel.syncIndexes();
    await SignupModel.syncIndexes();
  });

  afterEach(async () => {
    await clearTestDatabase();
  });

  afterAll(async () => {
    await stopTestDatabase();
  });

  describe("POST /api/v1/shifts/:shiftId/signups", () => {
    it("confirms a signup and treats a repeated request as idempotent", async () => {
      const volunteer = await createVolunteer();
      const shift = await createOpenShift();
      const endpoint = `/api/v1/shifts/${shift._id.toString()}/signups`;

      const created = await request(app).post(endpoint).send({
        volunteerId: volunteer._id.toString(),
      });
      const repeated = await request(app).post(endpoint).send({
        volunteerId: volunteer._id.toString(),
      });

      expect(created.status).toBe(201);
      expect(created.body.data.status).toBe("CONFIRMED");
      expect(repeated.status).toBe(200);
      expect(repeated.body.data.id).toBe(created.body.data.id);

      const refreshedShift = await ShiftModel.findById(shift._id);
      expect(refreshedShift?.confirmedCount).toBe(1);
      expect(await SignupModel.countDocuments()).toBe(1);
    });

    it("rejects a signup after capacity is reached", async () => {
      const firstVolunteer = await createVolunteer(1);
      const secondVolunteer = await createVolunteer(2);
      const shift = await createOpenShift({ capacity: 1 });
      const endpoint = `/api/v1/shifts/${shift._id.toString()}/signups`;

      await request(app).post(endpoint).send({
        volunteerId: firstVolunteer._id.toString(),
      });
      const response = await request(app).post(endpoint).send({
        volunteerId: secondVolunteer._id.toString(),
      });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe("SHIFT_FULL");
    });

    it("rejects overlapping shifts but permits adjacent shifts", async () => {
      const volunteer = await createVolunteer();
      const first = await createOpenShift({
        title: "First",
        startAt: hoursFromNow(2),
        endAt: hoursFromNow(4),
      });
      const overlapping = await createOpenShift({
        title: "Overlapping",
        startAt: hoursFromNow(3),
        endAt: hoursFromNow(5),
      });
      const adjacent = await createOpenShift({
        title: "Adjacent",
        startAt: hoursFromNow(4),
        endAt: hoursFromNow(6),
      });

      await request(app)
        .post(`/api/v1/shifts/${first._id.toString()}/signups`)
        .send({ volunteerId: volunteer._id.toString() });

      const rejected = await request(app)
        .post(`/api/v1/shifts/${overlapping._id.toString()}/signups`)
        .send({ volunteerId: volunteer._id.toString() });
      const accepted = await request(app)
        .post(`/api/v1/shifts/${adjacent._id.toString()}/signups`)
        .send({ volunteerId: volunteer._id.toString() });

      expect(rejected.status).toBe(409);
      expect(rejected.body.error.code).toBe("SHIFT_TIME_CONFLICT");
      expect(accepted.status).toBe(201);
    });

    it("never exceeds capacity during concurrent signup requests", async () => {
      const capacity = 2;
      const shift = await createOpenShift({ capacity });
      const volunteers = await VolunteerModel.insertMany(
        Array.from({ length: 8 }, (_, index) => ({
          name: `Concurrent Volunteer ${index}`,
          email: `concurrent${index}@example.com`,
          team: index % 2 === 0 ? "SYSTEMS" : "EXPERIENCE",
        })),
      );
      const endpoint = `/api/v1/shifts/${shift._id.toString()}/signups`;

      const responses = await Promise.all(
        volunteers.map((volunteer) =>
          request(app).post(endpoint).send({
            volunteerId: volunteer._id.toString(),
          }),
        ),
      );

      expect(
        responses.filter((response) => response.status === 201),
      ).toHaveLength(capacity);
      expect(
        responses.filter((response) => response.status === 409),
      ).toHaveLength(volunteers.length - capacity);

      const refreshedShift = await ShiftModel.findById(shift._id);
      const confirmedSignups = await SignupModel.countDocuments({
        shiftId: shift._id,
        status: "CONFIRMED",
      });
      expect(refreshedShift?.confirmedCount).toBe(capacity);
      expect(confirmedSignups).toBe(capacity);
    });

    it("allows only one of two concurrent overlapping signups", async () => {
      const volunteer = await createVolunteer();
      const firstShift = await createOpenShift({
        title: "Concurrent First",
        startAt: hoursFromNow(2),
        endAt: hoursFromNow(5),
      });
      const secondShift = await createOpenShift({
        title: "Concurrent Second",
        startAt: hoursFromNow(3),
        endAt: hoursFromNow(6),
      });
      const firstEndpoint =
        "/api/v1/shifts/" + firstShift._id.toString() + "/signups";
      const secondEndpoint =
        "/api/v1/shifts/" + secondShift._id.toString() + "/signups";

      const responses = await Promise.all([
        request(app)
          .post(firstEndpoint)
          .send({ volunteerId: volunteer._id.toString() }),
        request(app)
          .post(secondEndpoint)
          .send({ volunteerId: volunteer._id.toString() }),
      ]);

      expect(responses.map((response) => response.status).sort()).toEqual([
        201, 409,
      ]);
      expect(
        responses.find((response) => response.status === 409)?.body.error.code,
      ).toBe("SHIFT_TIME_CONFLICT");
      expect(
        await SignupModel.countDocuments({
          volunteerId: volunteer._id,
          status: "CONFIRMED",
        }),
      ).toBe(1);

      const refreshedShifts = await ShiftModel.find({
        _id: { $in: [firstShift._id, secondShift._id] },
      });
      expect(
        refreshedShifts.reduce(
          (total, shift) => total + shift.confirmedCount,
          0,
        ),
      ).toBe(1);
    });

    it("restores a cancelled signup without creating another document", async () => {
      const volunteer = await createVolunteer();
      const shift = await createOpenShift();
      const collectionEndpoint =
        "/api/v1/shifts/" + shift._id.toString() + "/signups";
      const itemEndpoint = collectionEndpoint + "/" + volunteer._id.toString();

      const created = await request(app).post(collectionEndpoint).send({
        volunteerId: volunteer._id.toString(),
      });
      await request(app).delete(itemEndpoint);
      const restored = await request(app).post(collectionEndpoint).send({
        volunteerId: volunteer._id.toString(),
      });

      expect(created.status).toBe(201);
      expect(restored.status).toBe(200);
      expect(restored.body.data).toMatchObject({
        id: created.body.data.id,
        status: "CONFIRMED",
      });
      expect(restored.body.data.cancelledAt).toBeUndefined();
      expect(
        await SignupModel.countDocuments({
          shiftId: shift._id,
          volunteerId: volunteer._id,
        }),
      ).toBe(1);
      expect((await ShiftModel.findById(shift._id))?.confirmedCount).toBe(1);
    });
  });

  describe("GET /api/v1/shifts/:shiftId/candidates", () => {
    it("ranks eligible staff and explains assignment conflicts", async () => {
      const targetStart = hoursFromNow(4);
      const targetEnd = hoursFromNow(6);
      const targetShift = await createOpenShift({
        title: "Target Shift",
        capacity: 8,
        startAt: targetStart,
        endAt: targetEnd,
      });
      const overlappingShift = await createOpenShift({
        title: "Overlapping Shift",
        startAt: new Date(targetStart.getTime() + 60 * 60 * 1_000),
        endAt: new Date(targetEnd.getTime() + 60 * 60 * 1_000),
      });
      const adjacentShift = await createOpenShift({
        title: "Adjacent Shift",
        startAt: hoursFromNow(2),
        endAt: targetStart,
      });
      const [highestPriority, adjacent, conflicting, alreadyAssigned] =
        await VolunteerModel.create([
          {
            name: "Highest Priority",
            email: "highest@example.com",
            team: "SYSTEMS",
            requiredShiftCount: 3,
          },
          {
            name: "Adjacent Staff",
            email: "adjacent@example.com",
            team: "SYSTEMS",
            requiredShiftCount: 2,
          },
          {
            name: "Conflicting Staff",
            email: "conflicting@example.com",
            team: "SYSTEMS",
            requiredShiftCount: 2,
          },
          {
            name: "Already Assigned",
            email: "assigned@example.com",
            team: "DESIGN",
            requiredShiftCount: 2,
          },
        ]);

      if (!highestPriority || !adjacent || !conflicting || !alreadyAssigned) {
        throw new Error("Test volunteers were not created");
      }

      await SignupModel.create([
        {
          shiftId: adjacentShift._id,
          volunteerId: adjacent._id,
          status: "CONFIRMED",
        },
        {
          shiftId: overlappingShift._id,
          volunteerId: conflicting._id,
          status: "CONFIRMED",
        },
        {
          shiftId: targetShift._id,
          volunteerId: alreadyAssigned._id,
          status: "CONFIRMED",
        },
      ]);

      const endpoint =
        "/api/v1/shifts/" + targetShift._id.toString() + "/candidates";
      const response = await request(app).get(endpoint);

      expect(response.status).toBe(200);
      expect(response.body.data[0]).toMatchObject({
        id: highestPriority._id.toString(),
        name: "Highest Priority",
        confirmedShiftCount: 0,
        remainingShiftCount: 3,
        eligibility: "ELIGIBLE",
      });

      const candidatesByName = Object.fromEntries(
        response.body.data.map((candidate: { name: string }) => [
          candidate.name,
          candidate,
        ]),
      );
      expect(candidatesByName["Adjacent Staff"]).toMatchObject({
        confirmedShiftCount: 1,
        remainingShiftCount: 1,
        eligibility: "ELIGIBLE",
      });
      expect(candidatesByName["Conflicting Staff"]).toMatchObject({
        eligibility: "SCHEDULE_CONFLICT",
        reason: "Overlaps with Overlapping Shift",
        conflictingShift: {
          id: overlappingShift._id.toString(),
          title: "Overlapping Shift",
        },
      });
      expect(candidatesByName["Already Assigned"]).toMatchObject({
        eligibility: "ALREADY_ASSIGNED",
        reason: "Already assigned to this shift",
      });
      expect(response.body.pagination).toMatchObject({
        page: 1,
        limit: 100,
        totalItems: 4,
        totalPages: 1,
      });

      const filtered = await request(app).get(
        endpoint + "?team=SYSTEMS&eligibility=ELIGIBLE",
      );

      expect(filtered.status).toBe(200);
      expect(
        filtered.body.data.map((candidate: { name: string }) => candidate.name),
      ).toEqual(["Highest Priority", "Adjacent Staff"]);
    });

    it("marks unassigned staff unavailable when the shift is full", async () => {
      const assigned = await createVolunteer(1);
      const waiting = await createVolunteer(2);
      const shift = await createOpenShift({ capacity: 1 });
      const signupEndpoint =
        "/api/v1/shifts/" + shift._id.toString() + "/signups";

      await request(app)
        .post(signupEndpoint)
        .send({ volunteerId: assigned._id.toString() });

      const response = await request(app).get(
        "/api/v1/shifts/" + shift._id.toString() + "/candidates",
      );
      const candidate = response.body.data.find(
        (item: { id: string }) => item.id === waiting._id.toString(),
      );

      expect(response.status).toBe(200);
      expect(candidate).toMatchObject({
        eligibility: "SHIFT_FULL",
        reason: "This shift has reached capacity",
      });
    });

    it.each(["DRAFT", "CLOSED", "CANCELLED"] as const)(
      "marks candidates unavailable when the shift is %s",
      async (status) => {
        await createVolunteer();
        const shift = await createOpenShift();
        shift.status = status;
        await shift.save();

        const response = await request(app).get(
          "/api/v1/shifts/" + shift._id.toString() + "/candidates",
        );

        expect(response.status).toBe(200);
        expect(response.body.data[0]).toMatchObject({
          eligibility: "SHIFT_NOT_OPEN",
          reason: "This shift is not open for signups",
        });
      },
    );

    it("marks candidates unavailable after the shift has started", async () => {
      await createVolunteer();
      const shift = await createOpenShift({
        startAt: hoursFromNow(-2),
        endAt: hoursFromNow(-1),
      });

      const response = await request(app).get(
        "/api/v1/shifts/" + shift._id.toString() + "/candidates",
      );

      expect(response.status).toBe(200);
      expect(response.body.data[0]).toMatchObject({
        eligibility: "SHIFT_ALREADY_STARTED",
        reason: "This shift has already started",
      });
    });

    it("ignores cancelled signups when checking conflicts and commitments", async () => {
      const targetStart = hoursFromNow(4);
      const targetShift = await createOpenShift({
        title: "Target Shift",
        startAt: targetStart,
        endAt: hoursFromNow(6),
      });
      const overlappingShift = await createOpenShift({
        title: "Cancelled Assignment",
        startAt: new Date(targetStart.getTime() + 30 * 60 * 1_000),
        endAt: hoursFromNow(7),
      });
      const volunteer = await VolunteerModel.create({
        name: "Cancelled Staff",
        email: "cancelled-staff@example.com",
        team: "EXPERIENCE",
        requiredShiftCount: 2,
      });
      await SignupModel.create({
        shiftId: overlappingShift._id,
        volunteerId: volunteer._id,
        status: "CANCELLED",
        cancelledAt: new Date(),
      });

      const response = await request(app).get(
        "/api/v1/shifts/" + targetShift._id.toString() + "/candidates",
      );

      expect(response.status).toBe(200);
      expect(response.body.data[0]).toMatchObject({
        id: volunteer._id.toString(),
        confirmedShiftCount: 0,
        remainingShiftCount: 2,
        eligibility: "ELIGIBLE",
      });
      expect(response.body.data[0].conflictingShift).toBeUndefined();
    });

    it("ranks undercommitted staff ahead of eligible staff who are complete", async () => {
      const targetStart = hoursFromNow(4);
      const targetShift = await createOpenShift({
        title: "Target Shift",
        startAt: targetStart,
        endAt: hoursFromNow(6),
      });
      const adjacentShift = await createOpenShift({
        title: "Earlier Shift",
        startAt: hoursFromNow(2),
        endAt: targetStart,
      });
      const [undercommitted, complete] = await VolunteerModel.create([
        {
          name: "Undercommitted Staff",
          email: "under-ranked@example.com",
          team: "OUTREACH",
          requiredShiftCount: 2,
        },
        {
          name: "Complete Staff",
          email: "complete-ranked@example.com",
          team: "OUTREACH",
          requiredShiftCount: 1,
        },
      ]);

      if (!undercommitted || !complete) {
        throw new Error("Test volunteers were not created");
      }

      await SignupModel.create({
        shiftId: adjacentShift._id,
        volunteerId: complete._id,
        status: "CONFIRMED",
      });

      const response = await request(app).get(
        "/api/v1/shifts/" + targetShift._id.toString() + "/candidates",
      );

      expect(response.status).toBe(200);
      expect(
        response.body.data.map((candidate: { name: string }) => candidate.name),
      ).toEqual(["Undercommitted Staff", "Complete Staff"]);
      expect(response.body.data[1]).toMatchObject({
        eligibility: "ELIGIBLE",
        remainingShiftCount: 0,
      });
    });

    it("paginates candidates and rejects invalid query values", async () => {
      await Promise.all([
        createVolunteer(1),
        createVolunteer(2),
        createVolunteer(3),
      ]);
      const shift = await createOpenShift();
      const endpoint = "/api/v1/shifts/" + shift._id.toString() + "/candidates";

      const page = await request(app).get(endpoint + "?page=2&limit=2");
      const invalid = await request(app).get(
        endpoint + "?eligibility=NOT_A_REAL_STATUS",
      );

      expect(page.status).toBe(200);
      expect(page.body.data).toHaveLength(1);
      expect(page.body.pagination).toEqual({
        page: 2,
        limit: 2,
        totalItems: 3,
        totalPages: 2,
      });
      expect(invalid.status).toBe(400);
      expect(invalid.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("returns 404 when the target shift does not exist", async () => {
      const response = await request(app).get(
        "/api/v1/shifts/" + new Types.ObjectId().toString() + "/candidates",
      );

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe("SHIFT_NOT_FOUND");
    });
  });

  describe("DELETE /api/v1/shifts/:shiftId/signups/:volunteerId", () => {
    it("cancels idempotently and releases the capacity", async () => {
      const volunteer = await createVolunteer();
      const shift = await createOpenShift({ capacity: 1 });
      const collectionEndpoint = `/api/v1/shifts/${shift._id.toString()}/signups`;
      const itemEndpoint = `${collectionEndpoint}/${volunteer._id.toString()}`;

      await request(app).post(collectionEndpoint).send({
        volunteerId: volunteer._id.toString(),
      });

      const cancelled = await request(app).delete(itemEndpoint);
      const repeated = await request(app).delete(itemEndpoint);

      expect(cancelled.status).toBe(204);
      expect(repeated.status).toBe(204);

      const refreshedShift = await ShiftModel.findById(shift._id);
      const signup = await SignupModel.findOne({ shiftId: shift._id });
      expect(refreshedShift?.confirmedCount).toBe(0);
      expect(signup?.status).toBe("CANCELLED");
    });
  });

  describe("GET /api/v1/volunteers/:volunteerId/signups", () => {
    it("lists signup history by volunteer and status", async () => {
      const volunteer = await createVolunteer();
      const shift = await createOpenShift();
      const collectionEndpoint = `/api/v1/shifts/${shift._id.toString()}/signups`;

      await request(app).post(collectionEndpoint).send({
        volunteerId: volunteer._id.toString(),
      });

      const confirmed = await request(app).get(
        `/api/v1/volunteers/${volunteer._id.toString()}/signups`,
      );

      expect(confirmed.status).toBe(200);
      expect(confirmed.body.data).toHaveLength(1);
      expect(confirmed.body.data[0]).toMatchObject({
        shiftId: shift._id.toString(),
        volunteerId: volunteer._id.toString(),
        status: "CONFIRMED",
      });

      await request(app).delete(
        `${collectionEndpoint}/${volunteer._id.toString()}`,
      );

      const cancelled = await request(app).get(
        `/api/v1/volunteers/${volunteer._id.toString()}/signups?status=CANCELLED`,
      );

      expect(cancelled.status).toBe(200);
      expect(cancelled.body.data).toHaveLength(1);
      expect(cancelled.body.data[0].status).toBe("CANCELLED");
    });
  });

  describe("PATCH /api/v1/shifts/:shiftId", () => {
    it("cancelling a shift also cancels its confirmed signups", async () => {
      const volunteer = await createVolunteer();
      const shift = await createOpenShift();

      await request(app)
        .post(`/api/v1/shifts/${shift._id.toString()}/signups`)
        .send({ volunteerId: volunteer._id.toString() });

      const response = await request(app)
        .patch(`/api/v1/shifts/${shift._id.toString()}`)
        .send({ status: "CANCELLED" });

      expect(response.status).toBe(200);
      expect(response.body.data.status).toBe("CANCELLED");
      expect(response.body.data.confirmedCount).toBe(0);

      const signup = await SignupModel.findOne({ shiftId: shift._id });
      expect(signup?.status).toBe("CANCELLED");
    });
  });
});
