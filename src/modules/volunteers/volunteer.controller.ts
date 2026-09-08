import type { RequestHandler } from "express";
import { getValidatedRequest } from "../../middleware/validate-request.js";
import { listVolunteerSignups } from "../signups/signup.service.js";
import {
  createVolunteerRequest,
  getVolunteerRequest,
  listUndercommittedVolunteersRequest,
  listVolunteersRequest,
  listVolunteerSignupsRequest,
} from "./volunteer.schemas.js";
import {
  createVolunteer,
  getVolunteerById,
  listUndercommittedVolunteers,
  listVolunteers,
} from "./volunteer.service.js";

// Handle POST /api/v1/volunteers.
export const createVolunteerController: RequestHandler = async (_req, res) => {
  const { body } = getValidatedRequest<typeof createVolunteerRequest>(res);

  const volunteer = await createVolunteer(body);

  res.status(201).json({
    data: volunteer,
  });
};

export const listVolunteersController: RequestHandler = async (_req, res) => {
  const { query } = getValidatedRequest<typeof listVolunteersRequest>(res);
  const result = await listVolunteers(query);

  res.status(200).json({
    data: result.items,
    pagination: result.pagination,
  });
};

export const listUndercommittedVolunteersController: RequestHandler = async (
  _req,
  res,
) => {
  const { query } =
    getValidatedRequest<typeof listUndercommittedVolunteersRequest>(res);
  const result = await listUndercommittedVolunteers(query);

  res.status(200).json({
    data: result.items,
    pagination: result.pagination,
  });
};

// Handle GET /api/v1/volunteers/:volunteerId.
export const getVolunteerController: RequestHandler = async (_req, res) => {
  const { params } = getValidatedRequest<typeof getVolunteerRequest>(res);

  const volunteer = await getVolunteerById(params.volunteerId);

  res.status(200).json({
    data: volunteer,
  });
};

// Return one volunteer's confirmed or cancelled signup history.
export const listVolunteerSignupsController: RequestHandler = async (
  _req,
  res,
) => {
  const { params, query } =
    getValidatedRequest<typeof listVolunteerSignupsRequest>(res);
  const result = await listVolunteerSignups(params.volunteerId, query);

  res.status(200).json({
    data: result.items,
    pagination: result.pagination,
  });
};
