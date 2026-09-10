import { Router } from "express";
import { validateRequest } from "../../middleware/validate-request.js";
import { listShiftCandidatesController } from "./signup.controller.js";
import { listShiftCandidatesRequest } from "./signup.schemas.js";

const candidateRouter = Router({ mergeParams: true });

candidateRouter.get(
  "/",
  validateRequest(listShiftCandidatesRequest),
  listShiftCandidatesController,
);

export default candidateRouter;
