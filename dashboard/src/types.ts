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

export interface Shift {
  id: string;
  title: string;
  description: string;
  location: string;
  startAt: string;
  endAt: string;
  capacity: number;
  confirmedCount: number;
  spotsRemaining: number;
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
