export const teams = ["EXPERIENCE", "OUTREACH", "SYSTEMS", "DESIGN"] as const;
export type StaffTeam = (typeof teams)[number];

export type ShiftStatus = "DRAFT" | "OPEN" | "CLOSED" | "CANCELLED";

export interface Volunteer {
  id: string;
  name: string;
  email: string;
  phone?: string;
  team: StaffTeam;
  requiredShiftCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface UndercommittedVolunteer {
  id: string;
  name: string;
  email: string;
  phone?: string;
  team: StaffTeam;
  requiredShiftCount: number;
  confirmedShiftCount: number;
  remainingShiftCount: number;
}

export type CandidateEligibility =
  | "ELIGIBLE"
  | "SCHEDULE_CONFLICT"
  | "ALREADY_ASSIGNED"
  | "SHIFT_NOT_OPEN"
  | "SHIFT_ALREADY_STARTED"
  | "SHIFT_FULL";

export interface CandidateConflict {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
}

export interface ShiftCandidate {
  id: string;
  name: string;
  email: string;
  phone?: string;
  team: StaffTeam;
  requiredShiftCount: number;
  confirmedShiftCount: number;
  remainingShiftCount: number;
  eligibility: CandidateEligibility;
  reason?: string;
  conflictingShift?: CandidateConflict;
}

export interface Shift {
  id: string;
  title: string;
  description: string;
  location: string;
  startAt: string;
  endAt: string;
  capacity: number;
  minimumStaff: number;
  confirmedCount: number;
  spotsRemaining: number;
  staffNeeded: number;
  status: ShiftStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Signup {
  id: string;
  shiftId: string;
  volunteerId: string;
  status: "CONFIRMED" | "CANCELLED";
  signedUpAt: string;
  cancelledAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Pagination {
  page: number;
  limit: number;
  totalItems: number;
  totalPages: number;
}

export interface ListResponse<T> {
  data: T[];
  pagination: Pagination;
}
