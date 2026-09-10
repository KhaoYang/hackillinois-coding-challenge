import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError, dashboardApi } from "./api";
import {
  teams,
  type Shift,
  type ShiftCandidate,
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

type IconName =
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

function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, React.ReactNode> = {
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
        <path d="M22 21v-2a4 4 0 0 1-3-3.9M16 3.1a4 4 0 0 1 0 7.8" />
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
  return (
    formatter.format(new Date(startAt)) +
    " \u2013 " +
    formatter.format(new Date(endAt))
  );
}

function formatLongDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date(value));
}

function teamClass(team: StaffTeam): string {
  return "team-" + team.toLowerCase();
}

function cleanTitle(title: string): string {
  return title.replace("[DEMO] ", "");
}

function App() {
  const [volunteers, setVolunteers] = useState<Volunteer[]>([]);
  const [undercommitted, setUndercommitted] = useState<
    UndercommittedVolunteer[]
  >([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [signups, setSignups] = useState<Signup[]>([]);
  const [candidates, setCandidates] = useState<ShiftCandidate[]>([]);
  const [selectedShiftId, setSelectedShiftId] = useState("");
  const [selectedVolunteerId, setSelectedVolunteerId] = useState("");
  const [teamFilter, setTeamFilter] = useState<TeamFilter>("ALL");
  const [shiftFilter, setShiftFilter] = useState<ShiftFilter>("ALL");
  const [staffSearch, setStaffSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [candidatesLoading, setCandidatesLoading] = useState(false);
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

  const refreshOperationalData = useCallback(async (shiftId: string) => {
    try {
      const [underResponse, shiftResponse, candidateResponse] =
        await Promise.all([
          dashboardApi.undercommitted(),
          dashboardApi.shifts(),
          dashboardApi.shiftCandidates(shiftId),
        ]);

      setUndercommitted(underResponse.data);
      setShifts(shiftResponse.data);
      setCandidates(candidateResponse.data);
    } catch (error) {
      setToast({
        tone: "error",
        title: "Change saved; refresh failed",
        message:
          error instanceof Error
            ? error.message
            : "Refresh the dashboard to load the latest data",
      });
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

  const loadCandidates = useCallback(async (shiftId: string) => {
    if (!shiftId) {
      setCandidates([]);
      return;
    }

    setCandidatesLoading(true);
    try {
      const response = await dashboardApi.shiftCandidates(shiftId);
      setCandidates(response.data);
    } catch (error) {
      setCandidates([]);
      setToast({
        tone: "error",
        title: "Could not rank staff",
        message: error instanceof Error ? error.message : "Please try again",
      });
    } finally {
      setCandidatesLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    void Promise.all([
      loadSignups(selectedShiftId),
      loadCandidates(selectedShiftId),
    ]);
    setSelectedVolunteerId("");
  }, [loadCandidates, loadSignups, selectedShiftId]);

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
  const visibleShifts = shifts.filter(
    (shift) => shiftFilter === "ALL" || shift.status === shiftFilter,
  );
  const query = staffSearch.trim().toLowerCase();
  const matchesStaffFilters = (volunteer: {
    name: string;
    email: string;
    team: StaffTeam;
  }) => {
    const matchesTeam = teamFilter === "ALL" || volunteer.team === teamFilter;
    const matchesSearch =
      !query ||
      volunteer.name.toLowerCase().includes(query) ||
      volunteer.email.toLowerCase().includes(query);
    return matchesTeam && matchesSearch;
  };
  const visibleVolunteers = volunteers.filter(matchesStaffFilters);
  const visibleCandidates = candidates.filter(matchesStaffFilters);
  const eligibleCandidates = candidates.filter(
    (candidate) => candidate.eligibility === "ELIGIBLE",
  );
  const visibleEligibleCount = visibleCandidates.filter(
    (candidate) => candidate.eligibility === "ELIGIBLE",
  ).length;

  const openShiftCount = shifts.filter(
    (shift) => shift.status === "OPEN",
  ).length;
  const totalAssignments = shifts.reduce(
    (total, shift) => total + shift.confirmedCount,
    0,
  );
  const openCapacity = shifts
    .filter((shift) => shift.status === "OPEN")
    .reduce((total, shift) => total + shift.spotsRemaining, 0);
  const understaffedShiftCount = shifts.filter(
    (shift) => shift.status === "OPEN" && shift.staffNeeded > 0,
  ).length;

  async function handleSignup(volunteerId = selectedVolunteerId) {
    if (!selectedShift || !volunteerId) return;
    setSaving(true);

    try {
      const response = await dashboardApi.createSignup(
        selectedShift.id,
        volunteerId,
      );
      const volunteer = volunteerById.get(volunteerId);
      setSignups((current) => [
        ...current.filter(
          (signup) => signup.volunteerId !== response.data.volunteerId,
        ),
        response.data,
      ]);
      setToast({
        tone: "success",
        title: "Shift assigned",
        message:
          (volunteer?.name ?? "Staff member") +
          " was added to " +
          cleanTitle(selectedShift.title) +
          ".",
      });
      setSelectedVolunteerId("");
      await refreshOperationalData(selectedShift.id);
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
      setSignups((current) =>
        current.filter((currentSignup) => currentSignup.id !== signup.id),
      );
      setToast({
        tone: "success",
        title: "Assignment removed",
        message:
          (volunteer?.name ?? "Staff member") +
          " is no longer assigned to this shift.",
      });
      await refreshOperationalData(signup.shiftId);
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

  const canAssign =
    selectedShift?.status === "OPEN" &&
    selectedShift.spotsRemaining > 0 &&
    !saving;

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="HackIllinois Staff Ops">
          <img
            src="/assets/hackillinois/logo.svg"
            alt="HackIllinois"
            width="152"
            height="50"
          />
          <span className="brand-divider" aria-hidden="true" />
          <span className="product-name">Staff Operations</span>
        </a>

        <div className="topbar-actions">
          <span className={"connection " + (apiOnline ? "online" : "offline")}>
            <i aria-hidden="true" />
            {apiOnline ? "API connected" : "API offline"}
          </span>
          <a
            className="header-button"
            href="http://localhost:3000/api-docs"
            target="_blank"
            rel="noreferrer"
          >
            <Icon name="docs" />
            <span>API docs</span>
          </a>
          <button
            className="header-button icon-only"
            type="button"
            onClick={() => void loadDashboard()}
            aria-label="Refresh dashboard"
          >
            <Icon name="refresh" />
          </button>
        </div>
      </header>

      <main id="top">
        <section className="page-intro">
          <div>
            <p className="eyebrow">HackIllinois 2026 / Event operations</p>
            <h1>Shift coverage</h1>
            <p>
              Find staffing gaps, review commitments, and assign available staff
              from one workspace.
            </p>
          </div>
          <div className="event-state">
            <span className="live-dot" aria-hidden="true" />
            Live demo data
          </div>
        </section>

        <section className="overview-strip" aria-label="Operations summary">
          <article className="summary-item priority">
            <span className="summary-icon">
              <Icon name="alert" />
            </span>
            <span>
              <small>Needs coverage</small>
              <strong>{understaffedShiftCount}</strong>
            </span>
            <p>shifts below minimum staffing</p>
          </article>
          <article className="summary-item priority">
            <span className="summary-icon">
              <Icon name="users" />
            </span>
            <span>
              <small>Needs shifts</small>
              <strong>{undercommitted.length}</strong>
            </span>
            <p>staff below their commitment</p>
          </article>
          <article className="summary-item">
            <span>
              <small>Open shifts</small>
              <strong>{openShiftCount}</strong>
            </span>
            <p>{openCapacity} assignment spots remain</p>
          </article>
          <article className="summary-item">
            <span>
              <small>Assignments</small>
              <strong>{totalAssignments}</strong>
            </span>
            <p>confirmed across the event</p>
          </article>
        </section>

        <section
          className="operations-grid"
          aria-label="Shift assignment workspace"
        >
          <section className="panel shifts-panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Schedule</p>
                <h2>Event shifts</h2>
              </div>
              <span className="count-label">{visibleShifts.length} shown</span>
            </div>

            <div className="filter-tabs" aria-label="Filter shifts">
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

            <div className="shift-list">
              {loading ? (
                <>
                  <div className="skeleton shift-skeleton" />
                  <div className="skeleton shift-skeleton" />
                  <div className="skeleton shift-skeleton" />
                </>
              ) : visibleShifts.length === 0 ? (
                <div className="empty-state">
                  <Icon name="calendar" size={24} />
                  <strong>No shifts found</strong>
                  <span>Seed the database to load the demo schedule.</span>
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
                      className={
                        "shift-row " +
                        (selectedShiftId === shift.id ? "selected" : "") +
                        (shift.staffNeeded > 0 ? " needs-staff" : "")
                      }
                      onClick={() => setSelectedShiftId(shift.id)}
                    >
                      <span className="date-tile">
                        <small>{date.month}</small>
                        <strong>{date.day}</strong>
                      </span>
                      <span className="shift-summary">
                        <span className="shift-title-line">
                          <strong>{cleanTitle(shift.title)}</strong>
                          <i
                            className={
                              "status status-" + shift.status.toLowerCase()
                            }
                          >
                            {statusLabels[shift.status]}
                          </i>
                        </span>
                        <span className="shift-meta">
                          {formatTimeRange(shift.startAt, shift.endAt)}
                          <b aria-hidden="true">/</b>
                          {shift.location}
                        </span>
                        <span className="row-progress" aria-hidden="true">
                          <i style={{ width: fill + "%" }} />
                        </span>
                      </span>
                      <span
                        className={
                          "coverage-count " +
                          (shift.staffNeeded > 0 ? "warning" : "")
                        }
                      >
                        <strong>
                          {shift.confirmedCount}/{shift.capacity}
                        </strong>
                        <small>
                          {shift.staffNeeded > 0
                            ? shift.staffNeeded + " needed"
                            : shift.spotsRemaining + " open"}
                        </small>
                      </span>
                      <Icon name="chevron" size={16} />
                    </button>
                  );
                })
              )}
            </div>
          </section>

          <section className="panel assignment-panel">
            {selectedShift ? (
              <>
                <div className="assignment-header">
                  <div className="assignment-heading">
                    <span
                      className={
                        "status status-" + selectedShift.status.toLowerCase()
                      }
                    >
                      {statusLabels[selectedShift.status]}
                    </span>
                    <span>
                      {selectedShift.spotsRemaining} of {selectedShift.capacity}{" "}
                      spots open
                    </span>
                  </div>
                  <h2>{cleanTitle(selectedShift.title)}</h2>
                  <p>{selectedShift.description}</p>
                  <dl className="shift-facts">
                    <div>
                      <dt>
                        <Icon name="calendar" />
                      </dt>
                      <dd>{formatLongDate(selectedShift.startAt)}</dd>
                    </div>
                    <div>
                      <dt>
                        <Icon name="clock" />
                      </dt>
                      <dd>
                        {formatTimeRange(
                          selectedShift.startAt,
                          selectedShift.endAt,
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>
                        <Icon name="map" />
                      </dt>
                      <dd>{selectedShift.location}</dd>
                    </div>
                  </dl>
                </div>

                <div className="coverage-block">
                  <div className="coverage-heading">
                    <div>
                      <p className="eyebrow">Coverage</p>
                      <h3>
                        {selectedShift.confirmedCount} assigned
                        <span> / {selectedShift.minimumStaff} minimum</span>
                      </h3>
                    </div>
                    <span
                      className={
                        "coverage-badge " +
                        (selectedShift.staffNeeded > 0 ? "warning" : "good")
                      }
                    >
                      {selectedShift.staffNeeded > 0
                        ? selectedShift.staffNeeded + " staff needed"
                        : "Minimum met"}
                    </span>
                  </div>
                  <div className="coverage-meter" aria-hidden="true">
                    <i
                      style={{
                        width:
                          Math.min(
                            (selectedShift.confirmedCount /
                              selectedShift.capacity) *
                              100,
                            100,
                          ) + "%",
                      }}
                    />
                    <b
                      style={{
                        left:
                          Math.min(
                            (selectedShift.minimumStaff /
                              selectedShift.capacity) *
                              100,
                            100,
                          ) + "%",
                      }}
                    />
                  </div>
                  <div className="meter-labels">
                    <span>0</span>
                    <span>Capacity {selectedShift.capacity}</span>
                  </div>
                </div>

                <div className="assignees-block">
                  <div className="section-heading">
                    <h3>Assigned staff</h3>
                    <span>{signups.length}</span>
                  </div>
                  <div className="assignee-list">
                    {signups.length === 0 ? (
                      <div className="assignee-empty">
                        No one is assigned to this shift yet.
                      </div>
                    ) : (
                      signups.map((signup) => {
                        const volunteer = volunteerById.get(signup.volunteerId);
                        return (
                          <div className="assignee" key={signup.id}>
                            <span
                              className={
                                "avatar " +
                                (volunteer ? teamClass(volunteer.team) : "")
                              }
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
                              aria-label={
                                "Remove " +
                                (volunteer?.name ?? "staff member") +
                                " from this shift"
                              }
                            >
                              <Icon name="x" size={16} />
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                <div className="manual-assignment">
                  <label htmlFor="volunteer-select">
                    Assign another staff member
                  </label>
                  <div>
                    <select
                      id="volunteer-select"
                      value={selectedVolunteerId}
                      onChange={(event) =>
                        setSelectedVolunteerId(event.target.value)
                      }
                      disabled={!canAssign}
                    >
                      <option value="">
                        Choose from {eligibleCandidates.length} eligible staff
                      </option>
                      {eligibleCandidates.map((candidate) => (
                        <option key={candidate.id} value={candidate.id}>
                          {candidate.name} / {teamLabels[candidate.team]}
                        </option>
                      ))}
                    </select>
                    <button
                      className="primary-button"
                      type="button"
                      disabled={!selectedVolunteerId || !canAssign}
                      onClick={() => void handleSignup()}
                    >
                      {saving ? "Updating..." : "Assign"}
                    </button>
                  </div>
                  <small>
                    Capacity and scheduling conflicts are validated by the API.
                  </small>
                </div>
              </>
            ) : (
              <div className="empty-state tall">
                <Icon name="chevron" size={26} />
                <strong>Select a shift</strong>
                <span>Choose a schedule row to manage its coverage.</span>
              </div>
            )}
          </section>

          <aside className="panel priority-panel">
            <div className="panel-header priority-header">
              <div>
                <p className="eyebrow">Action queue</p>
                <h2>Recommended staff</h2>
              </div>
              <span className="count-label">
                {visibleEligibleCount} eligible
              </span>
            </div>
            <p className="panel-intro">
              Ranked by availability and remaining commitments. Conflicts stay
              visible so coordinators can understand why someone is unavailable.
            </p>

            <label className="search-box">
              <Icon name="search" size={17} />
              <input
                value={staffSearch}
                onChange={(event) => setStaffSearch(event.target.value)}
                placeholder="Search staff"
                aria-label="Search staff"
              />
            </label>

            <div className="team-filters" aria-label="Filter staff by team">
              <button
                type="button"
                className={teamFilter === "ALL" ? "active" : ""}
                onClick={() => setTeamFilter("ALL")}
              >
                All
              </button>
              {teams.map((team) => (
                <button
                  type="button"
                  key={team}
                  className={
                    (teamFilter === team ? "active " : "") + teamClass(team)
                  }
                  onClick={() => setTeamFilter(team)}
                >
                  {teamLabels[team]}
                </button>
              ))}
            </div>

            <div className="priority-list">
              {loading || candidatesLoading ? (
                <>
                  <div className="skeleton person-skeleton" />
                  <div className="skeleton person-skeleton" />
                  <div className="skeleton person-skeleton" />
                </>
              ) : visibleCandidates.length === 0 ? (
                <div className="queue-empty">
                  <span>
                    <Icon name="check" />
                  </span>
                  <strong>No matching candidates</strong>
                  <p>Try another team or search term.</p>
                </div>
              ) : (
                visibleCandidates.map((candidate) => (
                  <article
                    className={
                      "priority-person " +
                      (candidate.eligibility === "ELIGIBLE"
                        ? "eligible"
                        : "unavailable")
                    }
                    key={candidate.id}
                  >
                    <span className={"avatar " + teamClass(candidate.team)}>
                      {initials(candidate.name)}
                    </span>
                    <div>
                      <strong>{candidate.name}</strong>
                      <span
                        className={
                          candidate.eligibility === "ELIGIBLE"
                            ? ""
                            : "candidate-reason"
                        }
                        title={candidate.reason}
                      >
                        {candidate.eligibility === "ELIGIBLE" ? (
                          <>
                            {teamLabels[candidate.team]} /{" "}
                            {candidate.confirmedShiftCount} of{" "}
                            {candidate.requiredShiftCount}
                          </>
                        ) : (
                          candidate.reason
                        )}
                      </span>
                    </div>
                    <span className="remaining-count">
                      <strong>{candidate.remainingShiftCount}</strong>
                      <small>
                        {candidate.remainingShiftCount === 0 ? "met" : "left"}
                      </small>
                    </span>
                    <button
                      type="button"
                      disabled={
                        !canAssign || candidate.eligibility !== "ELIGIBLE"
                      }
                      onClick={() => void handleSignup(candidate.id)}
                      aria-label={
                        candidate.eligibility === "ELIGIBLE"
                          ? "Assign " +
                            candidate.name +
                            " to " +
                            (selectedShift
                              ? cleanTitle(selectedShift.title)
                              : "the selected shift")
                          : candidate.reason
                      }
                      title={candidate.reason}
                    >
                      {candidate.eligibility === "ELIGIBLE"
                        ? "Assign"
                        : candidate.eligibility === "ALREADY_ASSIGNED"
                          ? "Assigned"
                          : candidate.eligibility === "SCHEDULE_CONFLICT"
                            ? "Conflict"
                            : "Unavailable"}
                    </button>
                  </article>
                ))
              )}
            </div>

            <div className="queue-context">
              <Icon name="calendar" size={16} />
              <span>
                {selectedShift
                  ? "Assigning to " + cleanTitle(selectedShift.title)
                  : "Select a shift to begin assigning"}
              </span>
            </div>
          </aside>
        </section>

        <section className="panel directory-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Directory</p>
              <h2>All staff commitments</h2>
            </div>
            <span className="count-label">
              {visibleVolunteers.length} staff
            </span>
          </div>
          <div className="staff-table-wrap">
            <table className="staff-table">
              <thead>
                <tr>
                  <th>Staff member</th>
                  <th>Team</th>
                  <th>Commitment</th>
                  <th>Status</th>
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
                        <span className={"avatar " + teamClass(volunteer.team)}>
                          {initials(volunteer.name)}
                        </span>
                        <span>
                          <strong>{volunteer.name}</strong>
                          <small>{volunteer.email}</small>
                        </span>
                      </td>
                      <td>
                        <span
                          className={"team-label " + teamClass(volunteer.team)}
                        >
                          <i aria-hidden="true" />
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
                              style={{ width: progress + "%" }}
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
        <span>Volunteer shift API / live data</span>
      </footer>

      {toast && (
        <div
          className={"toast toast-" + toast.tone}
          role={toast.tone === "error" ? "alert" : "status"}
        >
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
