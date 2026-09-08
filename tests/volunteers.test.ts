import { Types } from "mongoose";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import app from "../src/app.js";
import { SignupModel } from "../src/modules/signups/signup.model.js";
import { VolunteerModel } from "../src/modules/volunteers/volunteer.model.js";
import {
  clearTestDatabase,
  startTestDatabase,
  stopTestDatabase,
} from "./helpers/database.js";

describe("Volunteer routes", () => {
  beforeAll(async () => {
    await startTestDatabase();

    // Recreate indexes for this temporary database before testing uniqueness.
    await VolunteerModel.syncIndexes();
    await SignupModel.syncIndexes();
  });

  afterEach(async () => {
    await clearTestDatabase();
  });

  afterAll(async () => {
    await stopTestDatabase();
  });

  describe("POST /api/v1/volunteers", () => {
    it("creates and normalizes a volunteer", async () => {
      const response = await request(app).post("/api/v1/volunteers").send({
        name: "  Ada Lovelace  ",
        email: "  Ada@Example.com  ",
        phone: "217-555-0100",
        team: "SYSTEMS",
      });

      expect(response.status).toBe(201);

      expect(response.body.data).toMatchObject({
        name: "Ada Lovelace",
        email: "ada@example.com",
        phone: "217-555-0100",
        team: "SYSTEMS",
        requiredShiftCount: 0,
      });

      expect(response.body.data.id).toMatch(/^[0-9a-f]{24}$/);
      expect(response.body.data.createdAt).toEqual(expect.any(String));
      expect(response.body.data.updatedAt).toEqual(expect.any(String));
    });

    it("rejects invalid request data", async () => {
      const response = await request(app).post("/api/v1/volunteers").send({
        name: "",
        email: "not-an-email",
        unexpectedField: true,
      });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
      expect(response.body.error.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: expect.stringMatching(/^body\./),
          }),
        ]),
      );
    });

    it("rejects duplicate normalized emails", async () => {
      await request(app).post("/api/v1/volunteers").send({
        name: "Ada Lovelace",
        email: "ada@example.com",
        team: "DESIGN",
      });

      const response = await request(app).post("/api/v1/volunteers").send({
        name: "Different Person",
        email: "ADA@EXAMPLE.COM",
        team: "OUTREACH",
      });

      expect(response.status).toBe(409);
      expect(response.body).toEqual({
        error: {
          code: "EMAIL_ALREADY_REGISTERED",
          message: "This email is already registered",
        },
      });
    });
  });

  describe("GET /api/v1/volunteers/:volunteerId", () => {
    it("retrieves a volunteer by ID", async () => {
      const volunteer = await VolunteerModel.create({
        name: "Grace Hopper",
        email: "grace@example.com",
        team: "SYSTEMS",
      });

      const response = await request(app).get(
        `/api/v1/volunteers/${volunteer._id.toString()}`,
      );

      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject({
        id: volunteer._id.toString(),
        name: "Grace Hopper",
        email: "grace@example.com",
        team: "SYSTEMS",
        requiredShiftCount: 0,
      });
    });

    it("rejects an invalid volunteer ID", async () => {
      const response = await request(app).get(
        "/api/v1/volunteers/not-an-object-id",
      );

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("returns 404 for a nonexistent volunteer", async () => {
      const volunteerId = new Types.ObjectId().toString();

      const response = await request(app).get(
        `/api/v1/volunteers/${volunteerId}`,
      );

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe("VOLUNTEER_NOT_FOUND");
    });
  });

  describe("GET /api/v1/volunteers", () => {
    it("lists and filters volunteers by team", async () => {
      await VolunteerModel.create([
        {
          name: "Systems Staff",
          email: "systems@example.com",
          team: "SYSTEMS",
        },
        {
          name: "Design Staff",
          email: "design@example.com",
          team: "DESIGN",
        },
      ]);

      const response = await request(app).get(
        "/api/v1/volunteers?team=SYSTEMS&limit=100",
      );

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0]).toMatchObject({
        name: "Systems Staff",
        team: "SYSTEMS",
      });
      expect(response.body.pagination).toMatchObject({
        page: 1,
        limit: 100,
        totalItems: 1,
        totalPages: 1,
      });
    });
  });

  describe("GET /api/v1/volunteers/undercommitted", () => {
    it("reports volunteers below their individual shift requirement", async () => {
      const [undercommitted, complete, exempt] = await VolunteerModel.create([
        {
          name: "Undercommitted Staff",
          email: "undercommitted@example.com",
          team: "EXPERIENCE",
          requiredShiftCount: 2,
        },
        {
          name: "Complete Staff",
          email: "complete@example.com",
          team: "SYSTEMS",
          requiredShiftCount: 1,
        },
        {
          name: "Exempt Staff",
          email: "exempt@example.com",
          team: "EXPERIENCE",
          requiredShiftCount: 0,
        },
      ]);

      if (!undercommitted || !complete || !exempt) {
        throw new Error("Test volunteers were not created");
      }

      await SignupModel.create([
        {
          shiftId: new Types.ObjectId(),
          volunteerId: undercommitted._id,
          status: "CONFIRMED",
        },
        {
          shiftId: new Types.ObjectId(),
          volunteerId: complete._id,
          status: "CONFIRMED",
        },
        {
          shiftId: new Types.ObjectId(),
          volunteerId: exempt._id,
          status: "CANCELLED",
        },
      ]);

      const response = await request(app).get(
        "/api/v1/volunteers/undercommitted?team=EXPERIENCE",
      );

      expect(response.status).toBe(200);
      expect(response.body.data).toEqual([
        {
          id: undercommitted._id.toString(),
          name: "Undercommitted Staff",
          email: "undercommitted@example.com",
          team: "EXPERIENCE",
          requiredShiftCount: 2,
          confirmedShiftCount: 1,
          remainingShiftCount: 1,
        },
      ]);
      expect(response.body.pagination.totalItems).toBe(1);
    });
  });
});
