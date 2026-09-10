import request from "supertest";
import { describe, expect, it } from "vitest";
import app from "../src/app.js";

describe("Application routes", () => {
  describe("GET /health", () => {
    it("reports that the API process is healthy", async () => {
      const response = await request(app).get("/health");

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        data: {
          status: "ok",
        },
      });
    });
  });

  describe("GET /api-docs.json", () => {
    it("serves the machine-readable API documentation", async () => {
      const response = await request(app).get("/api-docs.json");

      expect(response.status).toBe(200);
      expect(response.body.openapi).toBe("3.0.3");
      expect(response.body.paths).toHaveProperty(
        "/api/v1/shifts/{shiftId}/signups",
      );
      expect(response.body.paths).toHaveProperty(
        "/api/v1/shifts/{shiftId}/candidates",
      );
    });
  });

  describe("GET /api-docs/", () => {
    it("serves the interactive Swagger UI", async () => {
      const response = await request(app).get("/api-docs/");

      expect(response.status).toBe(200);
      expect(response.headers["content-type"]).toContain("text/html");
      expect(response.text).toContain("HackIllinois Staff Shift API");
    });
  });

  describe("GET /does-not-exist", () => {
    it("returns the standard JSON error for an unknown route", async () => {
      const response = await request(app).get("/does-not-exist");

      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        error: {
          code: "ROUTE_NOT_FOUND",
          message: "Cannot GET /does-not-exist",
        },
      });
    });
  });

  describe("POST /api/v1/volunteers with malformed JSON", () => {
    it("returns a JSON validation error", async () => {
      const response = await request(app)
        .post("/api/v1/volunteers")
        .set("Content-Type", "application/json")
        .send('{"name":');

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: {
          code: "MALFORMED_JSON",
          message: "The request body contains malformed JSON",
        },
      });
    });
  });
});
