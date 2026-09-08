import { Router } from "express";
import { validateRequest } from "../../middleware/validate-request.js";
import {
  cancelSignupController,
  createSignupController,
  listSignupsController,
} from "./signup.controller.js";
import {
  cancelSignupRequest,
  createSignupRequest,
  listSignupsRequest,
} from "./signup.schemas.js";

const signupRouter = Router({ mergeParams: true });

signupRouter.post(
  "/",
  validateRequest(createSignupRequest),
  createSignupController,
);
signupRouter.get(
  "/",
  validateRequest(listSignupsRequest),
  listSignupsController,
);
signupRouter.delete(
  "/:volunteerId",
  validateRequest(cancelSignupRequest),
  cancelSignupController,
);

export default signupRouter;
