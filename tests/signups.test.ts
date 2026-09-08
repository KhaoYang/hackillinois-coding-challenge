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
