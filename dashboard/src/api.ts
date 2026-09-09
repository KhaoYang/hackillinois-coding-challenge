import type {
  ListResponse,
  Shift,
  Signup,
  UndercommittedVolunteer,
  Volunteer,
} from "./types";

interface ErrorResponse {
  error?: {
    code?: string;
    message?: string;
  };
}

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as ErrorResponse;
    throw new ApiError(
      body.error?.code ?? `HTTP_${response.status}`,
      body.error?.message ?? "The API request failed",
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export const dashboardApi = {
  health: () => apiRequest<{ data: { status: string } }>("/health"),

  volunteers: () =>
    apiRequest<ListResponse<Volunteer>>("/api/v1/volunteers?limit=100"),

  undercommitted: () =>
    apiRequest<ListResponse<UndercommittedVolunteer>>(
      "/api/v1/volunteers/undercommitted?limit=100",
    ),

  shifts: () => apiRequest<ListResponse<Shift>>("/api/v1/shifts?limit=100"),

  shiftSignups: (shiftId: string) =>
    apiRequest<ListResponse<Signup>>(
      `/api/v1/shifts/${shiftId}/signups?status=CONFIRMED&limit=100`,
    ),

  createSignup: (shiftId: string, volunteerId: string) =>
    apiRequest<{ data: Signup }>(`/api/v1/shifts/${shiftId}/signups`, {
      method: "POST",
      body: JSON.stringify({ volunteerId }),
    }),

  cancelSignup: (shiftId: string, volunteerId: string) =>
    apiRequest<void>(`/api/v1/shifts/${shiftId}/signups/${volunteerId}`, {
      method: "DELETE",
    }),
};
