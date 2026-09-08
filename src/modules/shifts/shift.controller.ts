import type { RequestHandler } from "express";
import { getValidatedRequest } from "../../middleware/validate-request.js";
import {
  createShiftRequest,
  deleteShiftRequest,
  getShiftRequest,
  listShiftsRequest,
  updateShiftRequest,
} from "./shift.schemas.js";
import {
  createShift,
  deleteShift,
  getShiftById,
  listShifts,
  updateShift,
} from "./shift.service.js";

export const createShiftController: RequestHandler = async (_req, res) => {
  const { body } = getValidatedRequest<typeof createShiftRequest>(res);
  const shift = await createShift(body);

  res.status(201).json({ data: shift });
};

export const listShiftsController: RequestHandler = async (_req, res) => {
  const { query } = getValidatedRequest<typeof listShiftsRequest>(res);
  const result = await listShifts(query);

  res.status(200).json({
    data: result.items,
    pagination: result.pagination,
  });
};

export const getShiftController: RequestHandler = async (_req, res) => {
  const { params } = getValidatedRequest<typeof getShiftRequest>(res);
  const shift = await getShiftById(params.shiftId);

  res.status(200).json({ data: shift });
};

export const updateShiftController: RequestHandler = async (_req, res) => {
  const { params, body } = getValidatedRequest<typeof updateShiftRequest>(res);
  const shift = await updateShift(params.shiftId, body);

  res.status(200).json({ data: shift });
};

export const deleteShiftController: RequestHandler = async (_req, res) => {
  const { params } = getValidatedRequest<typeof deleteShiftRequest>(res);
  await deleteShift(params.shiftId);

  res.status(204).send();
};
