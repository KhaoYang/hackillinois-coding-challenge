import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError, dashboardApi } from "./api";
import {
  teams,
  type Shift,
  type ShiftStatus,
  type Signup,
  type StaffTeam,
  type UndercommittedVolunteer,
  type Volunteer,
} from "./types";

type TeamFilter = "ALL" | StaffTeam;
type ShiftFilter = "ALL" | ShiftStatus;

const teamLabels: Record<StaffTeam, string> = {
  EXPERIENCE: "Experience",
  OUTREACH: "Outreach",
  SYSTEMS: "Systems",
  DESIGN: "Design",
};

const statusLabels: Record<ShiftStatus, string> = {
  DRAFT: "Draft",
  OPEN: "Open",
  CLOSED: "Closed",
  CANCELLED: "Cancelled",
};

function Icon({
  name,
  size = 18,
}: {
  name:
    | "alert"
    | "calendar"
    | "check"
    | "chevron"
    | "clock"
    | "docs"
    | "map"
    | "refresh"
    | "search"
    | "users"
    | "x";
  size?: number;
}) {
  const paths: Record<typeof name, React.ReactNode> = {
    alert: (
      <>
        <path d="M10.3 2.9 1.8 17a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 2.9a2 2 0 0 0-3.4 0Z" />
        <path d="M12 9v4M12 17h.01" />
      </>
    ),
    calendar: (
      <>
        <rect width="18" height="18" x="3" y="4" rx="2" />
        <path d="M16 2v4M8 2v4M3 10h18" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    chevron: <path d="m9 18 6-6-6-6" />,
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    docs: (
      <>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
        <path d="M14 2v6h6M8 13h8M8 17h6" />
      </>
    ),
    map: (
      <>
        <path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" />
        <circle cx="12" cy="10" r="2.5" />
      </>
    ),
    refresh: (
      <>
        <path d="M20 7h-5V2" />
        <path d="M20 7a9 9 0 1 0 1 8" />
      </>
    ),
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-4-4" />
      </>
    ),
    users: (
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" />
      </>
    ),
    x: <path d="M18 6 6 18M6 6l12 12" />,
  };

  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  );
}

function initials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function formatShiftDay(value: string): { month: string; day: string } {
  const date = new Date(value);
  return {
    month: new Intl.DateTimeFormat("en-US", { month: "short" })
      .format(date)
      .toUpperCase(),
    day: new Intl.DateTimeFormat("en-US", { day: "2-digit" }).format(date),
  };
}

function formatTimeRange(startAt: string, endAt: string): string {
  const formatter = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${formatter.format(new Date(startAt))} – ${formatter.format(new Date(endAt))}`;
}

function formatLongDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date(value));
}

function teamClass(team: StaffTeam): string {
  return `team-${team.toLowerCase()}`;
}

function App() {
  const [volunteers, setVolunteers] = useState<Volunteer[]>([]);
  const [undercommitted, setUndercommitted] = useState<
    UndercommittedVolunteer[]
  >([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [signups, setSignups] = useState<Signup[]>([]);
  const [selectedShiftId, setSelectedShiftId] = useState("");
  const [selectedVolunteerId, setSelectedVolunteerId] = useState("");
  const [teamFilter, setTeamFilter] = useState<TeamFilter>("ALL");
  const [shiftFilter, setShiftFilter] = useState<ShiftFilter>("ALL");
  const [staffSearch, setStaffSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [apiOnline, setApiOnline] = useState(false);
  const [toast, setToast] = useState<{
    tone: "success" | "error";
    title: string;
    message: string;
  } | null>(null);

  const loadDashboard = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);

    try {
      const [health, volunteerResponse, underResponse, shiftResponse] =
        await Promise.all([
          dashboardApi.health(),
          dashboardApi.volunteers(),
          dashboardApi.undercommitted(),
          dashboardApi.shifts(),
        ]);

      setApiOnline(health.data.status === "ok");
      setVolunteers(volunteerResponse.data);
      setUndercommitted(underResponse.data);
      setShifts(shiftResponse.data);
      setSelectedShiftId((current) => {
        if (shiftResponse.data.some((shift) => shift.id === current)) {
          return current;
        }
        return (
          shiftResponse.data.find((shift) => shift.status === "OPEN")?.id ??
          shiftResponse.data[0]?.id ??
          ""
        );
      });
    } catch (error) {
      setApiOnline(false);
      setToast({
        tone: "error",
        title: "API unavailable",
        message:
          error instanceof Error
            ? error.message
            : "Could not load dashboard data",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSignups = useCallback(async (shiftId: string) => {
    if (!shiftId) {
      setSignups([]);
      return;
    }

    try {
      const response = await dashboardApi.shiftSignups(shiftId);
      setSignups(response.data);
    } catch (error) {
      setSignups([]);
      setToast({
        tone: "error",
        title: "Could not load assignments",
        message: error instanceof Error ? error.message : "Please try again",
      });
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    void loadSignups(selectedShiftId);
    setSelectedVolunteerId("");
  }, [loadSignups, selectedShiftId]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 5_000);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const selectedShift = shifts.find((shift) => shift.id === selectedShiftId);
  const volunteerById = useMemo(
    () => new Map(volunteers.map((volunteer) => [volunteer.id, volunteer])),
    [volunteers],
  );
  const undercommittedById = useMemo(
    () => new Map(undercommitted.map((volunteer) => [volunteer.id, volunteer])),
    [undercommitted],
  );
  const signedUpIds = useMemo(
    () => new Set(signups.map((signup) => signup.volunteerId)),
    [signups],
  );

  const visibleShifts = shifts.filter(
    (shift) => shiftFilter === "ALL" || shift.status === shiftFilter,
  );
  const visibleVolunteers = volunteers.filter((volunteer) => {
    const matchesTeam = teamFilter === "ALL" || volunteer.team === teamFilter;
    const query = staffSearch.trim().toLowerCase();
    const matchesSearch =
      !query ||
      volunteer.name.toLowerCase().includes(query) ||
      volunteer.email.toLowerCase().includes(query);
    return matchesTeam && matchesSearch;
  });
  const availableVolunteers = volunteers.filter(
    (volunteer) => !signedUpIds.has(volunteer.id),
  );

  const totalAssignments = shifts.reduce(
    (total, shift) => total + shift.confirmedCount,
    0,
  );
  const openSpots = shifts
    .filter((shift) => shift.status === "OPEN")
    .reduce((total, shift) => total + shift.spotsRemaining, 0);

  async function handleSignup() {
    if (!selectedShift || !selectedVolunteerId) return;
    setSaving(true);

    try {
      await dashboardApi.createSignup(selectedShift.id, selectedVolunteerId);
      const volunteer = volunteerById.get(selectedVolunteerId);
      setToast({
        tone: "success",
        title: "Shift assigned",
        message: `${volunteer?.name ?? "Staff member"} was added to ${selectedShift.title}.`,
      });
      setSelectedVolunteerId("");
      await Promise.all([loadDashboard(true), loadSignups(selectedShift.id)]);
    } catch (error) {
      setToast({
        tone: "error",
        title:
          error instanceof ApiError
            ? error.code.replaceAll("_", " ")
            : "Signup failed",
        message: error instanceof Error ? error.message : "Please try again",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleCancellation(signup: Signup) {
    const volunteer = volunteerById.get(signup.volunteerId);
    setSaving(true);

    try {
      await dashboardApi.cancelSignup(signup.shiftId, signup.volunteerId);
      setToast({
        tone: "success",
        title: "Assignment removed",
        message: `${volunteer?.name ?? "Staff member"} is no longer assigned to this shift.`,
      });
      await Promise.all([loadDashboard(true), loadSignups(signup.shiftId)]);
    } catch (error) {
      setToast({
        tone: "error",
        title: "Cancellation failed",
        message: error instanceof Error ? error.message : "Please try again",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="HackIllinois Staff Ops">
          <span className="brand-mark">HI</span>
          <span>
            <strong>STAFF OPS</strong>
            <small>HackIllinois</small>
          </span>
        </a>
        <div className="topbar-actions">
          <span className={`connection ${apiOnline ? "online" : "offline"}`}>
            <i /> {apiOnline ? "API connected" : "API offline"}
          </span>
          <a
            className="icon-button docs-button"
            href="http://localhost:3000/api-docs"
            target="_blank"
            rel="noreferrer"
          >
            <Icon name="docs" /> <span>API docs</span>
          </a>
          <button
            className="icon-button"
            type="button"
            onClick={() => void loadDashboard()}
            aria-label="Refresh dashboard"
          >
            <Icon name="refresh" />
          </button>
        </div>
      </header>

      <main id="top">
        <section className="hero">
          <div>
            <p className="eyebrow">EVENT OPERATIONS / SHIFT CONTROL</p>
            <h1>
              Keep every moment <em>covered.</em>
            </h1>
            <p className="hero-copy">
              Plan the floor, balance team commitments, and assign staff without
              scheduling conflicts.
            </p>
          </div>
          <div className="event-chip">
            <span>LIVE PLAN</span>
            <strong>HackIllinois Demo</strong>
            <small>
              {shifts.filter((shift) => shift.status === "OPEN").length} shifts
              accepting staff
            </small>
          </div>
        </section>

        <section className="metric-grid" aria-label="Event overview">
          <article className="metric-card accent-blue">
            <span className="metric-icon">
              <Icon name="calendar" />
            </span>
            <div>
              <small>OPEN SHIFTS</small>
              <strong>
                {shifts.filter((shift) => shift.status === "OPEN").length}
              </strong>
            </div>
            <p>{shifts.length} total scheduled</p>
          </article>
          <article className="metric-card accent-violet">
            <span className="metric-icon">
              <Icon name="users" />
            </span>
            <div>
              <small>ASSIGNMENTS</small>
              <strong>{totalAssignments}</strong>
            </div>
            <p>Across all event shifts</p>
          </article>
          <article className="metric-card accent-mint">
            <span className="metric-icon">
              <Icon name="check" />
            </span>
            <div>
              <small>OPEN SPOTS</small>
              <strong>{openSpots}</strong>
            </div>
            <p>Still available to staff</p>
          </article>
          <article className="metric-card accent-coral">
            <span className="metric-icon">
              <Icon name="alert" />
            </span>
            <div>
              <small>NEEDS SHIFTS</small>
              <strong>{undercommitted.length}</strong>
            </div>
            <p>Staff below commitment</p>
          </article>
        </section>

        <section className="workspace-grid">
          <div className="panel shift-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">SCHEDULE</p>
                <h2>Event shifts</h2>
              </div>
              <div className="segmented-control" aria-label="Filter shifts">
                {(["ALL", "OPEN", "DRAFT", "CLOSED"] as ShiftFilter[]).map(
                  (status) => (
                    <button
                      key={status}
                      className={shiftFilter === status ? "active" : ""}
                      onClick={() => setShiftFilter(status)}
                      type="button"
                    >
                      {status === "ALL" ? "All" : statusLabels[status]}
                    </button>
                  ),
                )}
              </div>
            </div>

            <div className="shift-list">
              {loading ? (
                <>
                  <div className="skeleton shift-skeleton" />
                  <div className="skeleton shift-skeleton" />
                  <div className="skeleton shift-skeleton" />
                </>
              ) : visibleShifts.length === 0 ? (
                <div className="empty-state">
                  <Icon name="calendar" size={26} />
                  <strong>No shifts found</strong>
                  <span>Run npm run seed:demo to load the demo schedule.</span>
                </div>
              ) : (
                visibleShifts.map((shift) => {
                  const date = formatShiftDay(shift.startAt);
                  const fill = Math.min(
                    (shift.confirmedCount / shift.capacity) * 100,
                    100,
                  );
                  return (
                    <button
                      key={shift.id}
                      type="button"
                      className={`shift-row ${selectedShiftId === shift.id ? "selected" : ""}`}
                      onClick={() => setSelectedShiftId(shift.id)}
                    >
                      <span className="date-tile">
                        <small>{date.month}</small>
                        <strong>{date.day}</strong>
                      </span>
                      <span className="shift-summary">
                        <span className="shift-title-line">
                          <strong>{shift.title.replace("[DEMO] ", "")}</strong>
                          <i
                            className={`status status-${shift.status.toLowerCase()}`}
                          >
                            {statusLabels[shift.status]}
                          </i>
                        </span>
                        <span className="shift-meta">
                          <span>
                            <Icon name="clock" size={15} />
                            {formatTimeRange(shift.startAt, shift.endAt)}
                          </span>
                          <span>
                            <Icon name="map" size={15} />
                            {shift.location}
                          </span>
                        </span>
                      </span>
                      <span className="capacity-mini">
                        <span>
                          <strong>{shift.confirmedCount}</strong> /{" "}
                          {shift.capacity}
                        </span>
                        <i>
                          <b style={{ width: `${fill}%` }} />
                        </i>
                        <small>{shift.spotsRemaining} open</small>
                      </span>
                      <Icon name="chevron" size={17} />
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <aside className="panel assignment-panel">
            {selectedShift ? (
              <>
                <div className="assignment-hero">
                  <div className="assignment-topline">
                    <span
                      className={`status status-${selectedShift.status.toLowerCase()}`}
                    >
                      {statusLabels[selectedShift.status]}
                    </span>
                    <span>{selectedShift.spotsRemaining} spots left</span>
                  </div>
                  <h2>{selectedShift.title.replace("[DEMO] ", "")}</h2>
                  <p>{selectedShift.description}</p>
                  <div className="assignment-facts">
                    <span>
                      <Icon name="calendar" />
                      {formatLongDate(selectedShift.startAt)}
                    </span>
                    <span>
                      <Icon name="clock" />
                      {formatTimeRange(
                        selectedShift.startAt,
                        selectedShift.endAt,
                      )}
                    </span>
                    <span>
                      <Icon name="map" />
                      {selectedShift.location}
                    </span>
                  </div>
                </div>

                <div className="assignment-body">
                  <div className="assignment-heading">
                    <div>
                      <p className="eyebrow">ASSIGNED STAFF</p>
                      <h3>
                        {signups.length} of {selectedShift.capacity} spots
                      </h3>
                    </div>
                    <div className="avatar-stack">
                      {signups.slice(0, 3).map((signup) => {
                        const volunteer = volunteerById.get(signup.volunteerId);
                        return (
                          <span
                            key={signup.id}
                            className={
                              volunteer ? teamClass(volunteer.team) : ""
                            }
                          >
                            {volunteer ? initials(volunteer.name) : "?"}
                          </span>
                        );
                      })}
                    </div>
                  </div>

                  <div className="assignee-list">
                    {signups.length === 0 ? (
                      <div className="assignee-empty">
                        No one has claimed this shift yet.
                      </div>
                    ) : (
                      signups.map((signup) => {
                        const volunteer = volunteerById.get(signup.volunteerId);
                        return (
                          <div className="assignee" key={signup.id}>
                            <span
                              className={`avatar ${volunteer ? teamClass(volunteer.team) : ""}`}
                            >
                              {volunteer ? initials(volunteer.name) : "?"}
                            </span>
                            <span>
                              <strong>
                                {volunteer?.name ?? "Unknown staff"}
                              </strong>
                              <small>
                                {volunteer
                                  ? teamLabels[volunteer.team]
                                  : signup.volunteerId}
                              </small>
                            </span>
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() => void handleCancellation(signup)}
                              aria-label={`Remove ${volunteer?.name ?? "staff member"}`}
                            >
                              <Icon name="x" size={16} />
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>

                  <div className="add-assignment">
                    <label htmlFor="volunteer-select">ADD STAFF MEMBER</label>
                    <select
                      id="volunteer-select"
                      value={selectedVolunteerId}
                      onChange={(event) =>
                        setSelectedVolunteerId(event.target.value)
                      }
                      disabled={selectedShift.status !== "OPEN" || saving}
                    >
                      <option value="">
                        Choose from {availableVolunteers.length} available
                        staff…
                      </option>
                      {availableVolunteers.map((volunteer) => (
                        <option key={volunteer.id} value={volunteer.id}>
                          {volunteer.name} · {teamLabels[volunteer.team]}
                        </option>
                      ))}
                    </select>
                    <button
                      className="primary-button"
                      type="button"
                      disabled={
                        !selectedVolunteerId ||
                        selectedShift.status !== "OPEN" ||
                        selectedShift.spotsRemaining === 0 ||
                        saving
                      }
                      onClick={() => void handleSignup()}
                    >
                      {saving ? "Updating…" : "Assign to shift"}
                    </button>
                    <small>
                      The API checks capacity and schedule conflicts before
                      confirming.
                    </small>
                  </div>
                </div>
              </>
            ) : (
              <div className="empty-state tall">
                <Icon name="chevron" size={28} />
                <strong>Select a shift</strong>
                <span>Choose a schedule row to manage its assignments.</span>
              </div>
            )}
          </aside>
        </section>

        <section className="panel staff-panel">
          <div className="panel-heading staff-heading">
            <div>
              <p className="eyebrow">TEAM COVERAGE</p>
              <h2>Staff commitments</h2>
            </div>
            <div className="staff-tools">
              <label className="search-box">
                <Icon name="search" size={17} />
                <input
                  value={staffSearch}
                  onChange={(event) => setStaffSearch(event.target.value)}
                  placeholder="Search staff"
                />
              </label>
              <div className="team-filters">
                <button
                  type="button"
                  className={teamFilter === "ALL" ? "active" : ""}
                  onClick={() => setTeamFilter("ALL")}
                >
                  All teams
                </button>
                {teams.map((team) => (
                  <button
                    type="button"
                    key={team}
                    className={`${teamFilter === team ? "active" : ""} ${teamClass(team)}`}
                    onClick={() => setTeamFilter(team)}
                  >
                    {teamLabels[team]}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="staff-table-wrap">
            <table className="staff-table">
              <thead>
                <tr>
                  <th>STAFF MEMBER</th>
                  <th>TEAM</th>
                  <th>COMMITMENT</th>
                  <th>STATUS</th>
                </tr>
              </thead>
              <tbody>
                {visibleVolunteers.map((volunteer) => {
                  const gap = undercommittedById.get(volunteer.id);
                  const completeCount =
                    gap?.confirmedShiftCount ?? volunteer.requiredShiftCount;
                  const progress =
                    volunteer.requiredShiftCount === 0
                      ? 100
                      : Math.min(
                          (completeCount / volunteer.requiredShiftCount) * 100,
                          100,
                        );
                  return (
                    <tr key={volunteer.id}>
                      <td>
                        <span className={`avatar ${teamClass(volunteer.team)}`}>
                          {initials(volunteer.name)}
                        </span>
                        <span>
                          <strong>{volunteer.name}</strong>
                          <small>{volunteer.email}</small>
                        </span>
                      </td>
                      <td>
                        <span
                          className={`team-pill ${teamClass(volunteer.team)}`}
                        >
                          <i />
                          {teamLabels[volunteer.team]}
                        </span>
                      </td>
                      <td>
                        <div className="commitment">
                          <span>
                            <strong>{completeCount}</strong> /{" "}
                            {volunteer.requiredShiftCount} shifts
                          </span>
                          <i>
                            <b
                              className={gap ? "behind" : "complete"}
                              style={{ width: `${progress}%` }}
                            />
                          </i>
                        </div>
                      </td>
                      <td>
                        {volunteer.requiredShiftCount === 0 ? (
                          <span className="requirement-status neutral">
                            No minimum
                          </span>
                        ) : gap ? (
                          <span className="requirement-status warning">
                            <Icon name="alert" size={14} />
                            Needs {gap.remainingShiftCount} more
                          </span>
                        ) : (
                          <span className="requirement-status success">
                            <Icon name="check" size={14} />
                            Requirement met
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      <footer>
        <span>HackIllinois Staff Operations</span>
        <span>Live data from the volunteer shift API</span>
      </footer>

      {toast && (
        <div className={`toast toast-${toast.tone}`} role="status">
          <span>
            <Icon name={toast.tone === "success" ? "check" : "alert"} />
          </span>
          <div>
            <strong>{toast.title}</strong>
            <p>{toast.message}</p>
          </div>
          <button
            type="button"
            onClick={() => setToast(null)}
            aria-label="Dismiss notification"
          >
            <Icon name="x" size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

export default App;
