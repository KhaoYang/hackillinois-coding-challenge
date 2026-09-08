import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import app from "../src/app.js";
import { ShiftModel } from "../src/modules/shifts/shift.model.js";
import { SignupModel } from "../src/modules/signups/signup.model.js";
import {
  clearTestDatabase,
  startTestDatabase,
  stopTestDatabase,
} from "./helpers/database.js";

function isoHoursFromNow(hours: number): string {
  return new Date(Date.now() + hours * 60 * 60 * 1_000).toISOString();
}

function createShiftPayload(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    title: "Registration Desk",
    description: "Welcome participants and distribute badges",
    location: "Main Lobby",
    startAt: isoHoursFromNow(2),
    endAt: isoHoursFromNow(4),
    capacity: 4,
    status: "DRAFT",
    ...overrides,
  };
}

describe("Shift routes", () => {
  beforeAll(async () => {
    await startTestDatabase();
    await ShiftModel.syncIndexes();
    await SignupModel.syncIndexes();
  });

  afterEach(async () => {
    await clearTestDatabase();
  });

  afterAll(async () => {
    await stopTestDatabase();
  });

  describe("POST /api/v1/shifts", () => {
    it("creates a shift with derived availability", async () => {
      const response = await request(app)
        .post("/api/v1/shifts")
        .send(createShiftPayload());

      expect(response.status).toBe(201);
      expect(response.body.data).toMatchObject({
        title: "Registration Desk",
        capacity: 4,
        confirmedCount: 0,
        spotsRemaining: 4,
        status: "DRAFT",
      });
    });

    it("rejects a shift whose end time is not after its start time", async () => {
      const startAt = isoHoursFromNow(4);
      const response = await request(app)
        .post("/api/v1/shifts")
        .send(
          createShiftPayload({
            startAt,
            endAt: startAt,
          }),
        );

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
      expect(response.body.error.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: "body.endAt" }),
        ]),
      );
    });
  });

  describe("GET /api/v1/shifts", () => {
    it("filters shifts that intersect a requested time window", async () => {
      await ShiftModel.create([
        {
          ...createShiftPayload({
            title: "Inside Window",
            status: "OPEN",
            startAt: new Date(isoHoursFromNow(3)),
            endAt: new Date(isoHoursFromNow(5)),
          }),
        },
        {
          ...createShiftPayload({
            title: "Outside Window",
            status: "OPEN",
            startAt: new Date(isoHoursFromNow(8)),
            endAt: new Date(isoHoursFromNow(9)),
          }),
        },
        {
          ...createShiftPayload({
            title: "Draft In Window",
            status: "DRAFT",
            startAt: new Date(isoHoursFromNow(3)),
            endAt: new Date(isoHoursFromNow(5)),
          }),
        },
      ]);

      const from = encodeURIComponent(isoHoursFromNow(2));
      const to = encodeURIComponent(isoHoursFromNow(6));
      const response = await request(app).get(
        `/api/v1/shifts?status=OPEN&from=${from}&to=${to}`,
      );

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].title).toBe("Inside Window");
      expect(response.body.pagination.totalItems).toBe(1);
    });
  });

  describe("PATCH /api/v1/shifts/:shiftId", () => {
    it("enforces allowed lifecycle transitions", async () => {
      const created = await request(app)
        .post("/api/v1/shifts")
        .send(createShiftPayload());
      const shiftId = created.body.data.id as string;

      const opened = await request(app)
        .patch(`/api/v1/shifts/${shiftId}`)
        .send({ status: "OPEN" });

      expect(opened.status).toBe(200);
      expect(opened.body.data.status).toBe("OPEN");

      const reopenedAsDraft = await request(app)
        .patch(`/api/v1/shifts/${shiftId}`)
        .send({ status: "DRAFT" });

      expect(reopenedAsDraft.status).toBe(409);
      expect(reopenedAsDraft.body.error.code).toBe("INVALID_SHIFT_TRANSITION");
    });
  });

  describe("DELETE /api/v1/shifts/:shiftId", () => {
    it("physically deletes only unused draft shifts", async () => {
      const draft = await ShiftModel.create({
        ...createShiftPayload(),
        startAt: new Date(isoHoursFromNow(2)),
        endAt: new Date(isoHoursFromNow(4)),
      });
      const open = await ShiftModel.create({
        ...createShiftPayload({ status: "OPEN" }),
        startAt: new Date(isoHoursFromNow(5)),
        endAt: new Date(isoHoursFromNow(7)),
      });

      const deleted = await request(app).delete(
        `/api/v1/shifts/${draft._id.toString()}`,
      );
      const rejected = await request(app).delete(
        `/api/v1/shifts/${open._id.toString()}`,
      );

      expect(deleted.status).toBe(204);
      expect(rejected.status).toBe(409);
      expect(rejected.body.error.code).toBe("SHIFT_CANNOT_BE_DELETED");
    });
  });
});
