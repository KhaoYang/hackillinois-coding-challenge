import type { RequestHandler } from "express";
import { getValidatedRequest } from "../../middleware/validate-request.js";
import {
  cancelSignupRequest,
  createSignupRequest,
  listSignupsRequest,
} from "./signup.schemas.js";
import {
  cancelSignup,
  listShiftSignups,
  signupVolunteer,
} from "./signup.service.js";

export const createSignupController: RequestHandler = async (_req, res) => {
  const { params, body } = getValidatedRequest<typeof createSignupRequest>(res);
  const result = await signupVolunteer(params.shiftId, body.volunteerId);

  res.status(result.created ? 201 : 200).json({ data: result.signup });
};

export const cancelSignupController: RequestHandler = async (_req, res) => {
  const { params } = getValidatedRequest<typeof cancelSignupRequest>(res);
  await cancelSignup(params.shiftId, params.volunteerId);

  res.status(204).send();
};

export const listSignupsController: RequestHandler = async (_req, res) => {
  const { params, query } = getValidatedRequest<typeof listSignupsRequest>(res);
  const result = await listShiftSignups(params.shiftId, query);

  res.status(200).json({
    data: result.items,
    pagination: result.pagination,
  });
};
