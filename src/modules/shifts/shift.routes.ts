import { Router } from "express";
import { validateRequest } from "../../middleware/validate-request.js";
import {
  createShiftController,
  deleteShiftController,
  getShiftController,
  listShiftsController,
  listUnderstaffedShiftsController,
  updateShiftController,
} from "./shift.controller.js";
import {
  createShiftRequest,
  deleteShiftRequest,
  getShiftRequest,
  listShiftsRequest,
  understaffedShiftsRequest,
  updateShiftRequest,
} from "./shift.schemas.js";

const shiftRouter = Router();

shiftRouter.post(
  "/",
  validateRequest(createShiftRequest),
  createShiftController,
);
shiftRouter.get("/", validateRequest(listShiftsRequest), listShiftsController);
// Keep static routes above /:shiftId so Express does not interpret
// "understaffed" as a MongoDB ObjectId.
shiftRouter.get(
  "/understaffed",
  validateRequest(understaffedShiftsRequest),
  listUnderstaffedShiftsController,
);
shiftRouter.get(
  "/:shiftId",
  validateRequest(getShiftRequest),
  getShiftController,
);
shiftRouter.patch(
  "/:shiftId",
  validateRequest(updateShiftRequest),
  updateShiftController,
);
shiftRouter.delete(
  "/:shiftId",
  validateRequest(deleteShiftRequest),
  deleteShiftController,
);

export default shiftRouter;
