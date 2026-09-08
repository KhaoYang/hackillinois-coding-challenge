import { Router } from "express";
import { validateRequest } from "../../middleware/validate-request.js";
import {
  createVolunteerController,
  getVolunteerController,
  listUndercommittedVolunteersController,
  listVolunteersController,
  listVolunteerSignupsController,
} from "./volunteer.controller.js";
import {
  createVolunteerRequest,
  getVolunteerRequest,
  listUndercommittedVolunteersRequest,
  listVolunteersRequest,
  listVolunteerSignupsRequest,
} from "./volunteer.schemas.js";

const volunteerRouter = Router();

// POST /api/v1/volunteers
volunteerRouter.post(
  "/",
  validateRequest(createVolunteerRequest),
  createVolunteerController,
);

// GET /api/v1/volunteers
volunteerRouter.get(
  "/",
  validateRequest(listVolunteersRequest),
  listVolunteersController,
);

// Keep this static route before /:volunteerId so "undercommitted" is not
// interpreted as an ObjectId path parameter.
volunteerRouter.get(
  "/undercommitted",
  validateRequest(listUndercommittedVolunteersRequest),
  listUndercommittedVolunteersController,
);

// GET /api/v1/volunteers/:volunteerId/signups
volunteerRouter.get(
  "/:volunteerId/signups",
  validateRequest(listVolunteerSignupsRequest),
  listVolunteerSignupsController,
);

// GET /api/v1/volunteers/:volunteerId
volunteerRouter.get(
  "/:volunteerId",
  validateRequest(getVolunteerRequest),
  getVolunteerController,
);

export default volunteerRouter;
