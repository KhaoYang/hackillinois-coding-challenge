# Volunteer Shift API

A TypeScript, Express, and MongoDB API for creating volunteer shifts and
managing capacity-safe signups. Authentication is intentionally outside the
scope of this coding challenge.

## Highlights

- Zod validation for request bodies, parameters, queries, and environment
  variables
- Mongoose models with database-enforced unique indexes
- Shift lifecycle rules and time-window filtering
- Idempotent signup and cancellation operations
- Prevention of overlapping volunteer shifts
- Undercommitment reporting for staff who still owe required shifts
- Understaffing reporting for open shifts below their coverage target
- MongoDB transactions that prevent concurrent overbooking
- Consistent JSON errors and pagination responses
- Integration tests against a temporary MongoDB replica set

## Requirements

- Node.js and npm
- A MongoDB replica set, such as MongoDB Atlas or a locally configured replica
  set

A replica set is required because signup and cancellation operations use
multi-document transactions. A standalone local MongoDB process can run the
basic CRUD routes but cannot run those transaction-backed operations.

## Local setup

Install dependencies:

```bash
npm install
```

Copy `.env.example` to `.env` and replace `MONGODB_URI` with your connection
string:

```env
NODE_ENV=development
PORT=3000
MONGODB_URI=mongodb+srv://USERNAME:PASSWORD@CLUSTER.mongodb.net/volunteer_api
```

Never commit `.env`, because it may contain database credentials.

Load a small, repeatable HackIllinois-style demo dataset:

```bash
npm run seed:demo
```

Start the API and React operations dashboard together:

```bash
npm run demo
```

Open the primary visual demo at:

```text
http://localhost:5173
```

The dashboard uses the real API to show capacity, minimum staffing coverage,
team commitments, current assignments, and remaining shift requirements.
Select a shift to add or remove staff; capacity and time-conflict errors are
displayed directly in the UI.

Interactive API documentation remains available at:

```text
http://localhost:3000/api-docs
```

Swagger UI documents every request, response, filter, and expected error. Its
**Try it out** controls execute real requests against the running API. The raw
OpenAPI document is available at `http://localhost:3000/api-docs.json`.

The seed command creates six staff members across all four teams and five
future shifts, then adds signups that demonstrate fulfilled commitments,
undercommitment, overlapping times, and a full shift. It prints every generated
ID and a suggested demo sequence. Rerunning it resets only the five shifts that
the script owns, each of which has a title beginning with `[DEMO]`; it does not
clear the rest of the database.

Check its health:

```bash
curl http://localhost:3000/health
```

## Domain model

### Volunteer

Volunteers have a normalized, uniquely indexed email address. The internal
`bookingVersion` field is updated during schedule changes to serialize
concurrent signup operations for the same volunteer. Each volunteer also has an
individual `requiredShiftCount`; zero represents a volunteer with no minimum
commitment. Staff belong to one of four organizational teams: `EXPERIENCE`,
`OUTREACH`, `SYSTEMS`, or `DESIGN`. Team membership supports reporting but does
not restrict shift eligibility.

### Shift

A shift contains its location, time range, capacity, minimum staffing target,
confirmed count, and lifecycle status. Any staff member may sign up for any
available shift. `capacity` is the maximum number of assignments, while
`minimumStaff` is the coverage target organizers need to meet.

Valid statuses are:

```text
DRAFT -> OPEN -> CLOSED
   |       |       |
   +-------+-------+-> CANCELLED
```

A cancelled shift cannot be reopened. Shift times cannot change while
confirmed signups exist, and capacity cannot be reduced below the confirmed
count. Only unused draft shifts may be physically deleted; other shifts should
be cancelled to retain history. `minimumStaff` cannot exceed `capacity`.

### Signup

One signup document represents the relationship between one volunteer and one
shift. A compound unique index on `(shiftId, volunteerId)` prevents duplicate
records. Cancelling and rejoining transitions the existing document rather than
destroying its history.

## API endpoints

All domain endpoints use the `/api/v1` prefix.

| Method   | Endpoint                                       | Description                              |
| -------- | ---------------------------------------------- | ---------------------------------------- |
| `GET`    | `/health`                                      | Check API liveness                       |
| `GET`    | `/api/v1/volunteers`                           | Filter and paginate staff                |
| `POST`   | `/api/v1/volunteers`                           | Create a volunteer                       |
| `GET`    | `/api/v1/volunteers/undercommitted`            | List staff below their shift requirement |
| `GET`    | `/api/v1/volunteers/:volunteerId`              | Get one volunteer                        |
| `GET`    | `/api/v1/volunteers/:volunteerId/signups`      | List a volunteer's signup history        |
| `POST`   | `/api/v1/shifts`                               | Create a shift                           |
| `GET`    | `/api/v1/shifts`                               | Filter and paginate shifts               |
| `GET`    | `/api/v1/shifts/understaffed`                  | List open shifts below minimum staffing  |
| `GET`    | `/api/v1/shifts/:shiftId`                      | Get one shift                            |
| `PATCH`  | `/api/v1/shifts/:shiftId`                      | Update a shift or its lifecycle status   |
| `DELETE` | `/api/v1/shifts/:shiftId`                      | Delete an unused draft shift             |
| `POST`   | `/api/v1/shifts/:shiftId/signups`              | Sign a volunteer up                      |
| `GET`    | `/api/v1/shifts/:shiftId/signups`              | List a shift's signups                   |
| `DELETE` | `/api/v1/shifts/:shiftId/signups/:volunteerId` | Cancel a volunteer's signup              |

### Create a volunteer

```bash
curl -X POST http://localhost:3000/api/v1/volunteers \
  -H "Content-Type: application/json" \
  -d '{"name":"Ada Lovelace","email":"ada@example.com","team":"SYSTEMS","requiredShiftCount":3}'
```

### Find undercommitted staff

The report counts only `CONFIRMED` signups. Results are ordered by the largest
remaining commitment first and include pagination metadata.

```text
GET /api/v1/volunteers/undercommitted?team=SYSTEMS&page=1&limit=20
```

```json
{
  "data": [
    {
      "id": "66dbb7b2b77145bb72f63a10",
      "name": "Ada Lovelace",
      "email": "ada@example.com",
      "team": "SYSTEMS",
      "requiredShiftCount": 3,
      "confirmedShiftCount": 1,
      "remainingShiftCount": 2
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "totalItems": 1,
    "totalPages": 1
  }
}
```

### Create an open shift

Times must be ISO-8601 values. Open shifts must begin in the future.

```bash
curl -X POST http://localhost:3000/api/v1/shifts \
  -H "Content-Type: application/json" \
  -d '{
    "title":"Registration Desk",
    "description":"Welcome participants and distribute badges",
    "location":"Main Lobby",
    "startAt":"2027-02-20T14:00:00.000Z",
    "endAt":"2027-02-20T16:00:00.000Z",
    "capacity":4,
    "minimumStaff":2,
    "status":"OPEN"
  }'
```

### Filter shifts

`from` and `to` select shifts that intersect the requested time window. `page`
defaults to `1`, and `limit` defaults to `20` with a maximum of `100`.

```text
GET /api/v1/shifts?status=OPEN&from=2027-02-20T00:00:00.000Z&to=2027-02-21T00:00:00.000Z&page=1&limit=20
```

### Find understaffed shifts

The report returns future `OPEN` shifts whose confirmed assignments are below
`minimumStaff`. The largest staffing gaps appear first, and each result includes
the derived `staffNeeded` count.

```text
GET /api/v1/shifts/understaffed?page=1&limit=20
```

### Create and cancel a signup

```bash
curl -X POST http://localhost:3000/api/v1/shifts/SHIFT_ID/signups \
  -H "Content-Type: application/json" \
  -d '{"volunteerId":"VOLUNTEER_ID"}'

curl -X DELETE \
  http://localhost:3000/api/v1/shifts/SHIFT_ID/signups/VOLUNTEER_ID
```

A newly created signup returns `201`. Repeating an already successful signup
returns the existing resource with `200`, without consuming capacity again.
Cancellation is also idempotent and returns `204`.

## Concurrency guarantees

Signup is performed in one MongoDB transaction:

1. Update the volunteer's booking version to serialize schedule changes.
2. Check for an existing idempotent signup.
3. Reject closed, cancelled, past, or overlapping shifts.
4. Increment `confirmedCount` only when it is still below `capacity`.
5. Create or reactivate the signup.

The conditional capacity update and signup write either commit together or roll
back together. A concurrency integration test sends more simultaneous signup
requests than available positions and verifies that the persisted count never
exceeds capacity.

## Response format

Successful single-resource responses use a `data` envelope:

```json
{
  "data": {
    "id": "66dbb7b2b77145bb72f63a10"
  }
}
```

List responses also include pagination metadata:

```json
{
  "data": [],
  "pagination": {
    "page": 1,
    "limit": 20,
    "totalItems": 0,
    "totalPages": 0
  }
}
```

Errors have a stable machine-readable code:

```json
{
  "error": {
    "code": "SHIFT_FULL",
    "message": "This shift has reached capacity"
  }
}
```

Expected client errors use `400`, `404`, `409`, or `413`. Unexpected errors are
logged internally and returned as a generic `500` without exposing stack traces
or database details.

## Development commands

| Command                       | Purpose                                   |
| ----------------------------- | ----------------------------------------- |
| `npm run dev`                 | Run and reload the development server     |
| `npm run dev:dashboard`       | Run only the React dashboard              |
| `npm run demo`                | Run the API and dashboard together        |
| `npm run seed:demo`           | Load repeatable browser-demo data         |
| `npm run typecheck`           | Type-check application source             |
| `npm run typecheck:tests`     | Type-check application and tests          |
| `npm run typecheck:dashboard` | Type-check the React dashboard            |
| `npm test`                    | Run the integration tests once            |
| `npm run test:watch`          | Run tests in watch mode                   |
| `npm run format`              | Format supported project files            |
| `npm run format:check`        | Verify formatting without modifying files |
| `npm run build`               | Compile TypeScript into `dist`            |
| `npm run build:dashboard`     | Build the dashboard for production        |
| `npm run verify`              | Run all checks used for submission        |

The tests use `mongodb-memory-server` in replica-set mode. The first test run
may take longer while it downloads a compatible MongoDB binary.

## Architecture

Each domain module colocates its model, runtime schemas, service, controller,
and router:

```text
src/
  config/          environment and database lifecycle
  errors/          expected application errors
  middleware/      validation and HTTP error handling
  modules/
    volunteers/
    shifts/
    signups/
```

Controllers translate HTTP requests and responses. Services own business rules
and database operations. Models define persistence constraints. This keeps
Express-specific code out of concurrency-sensitive domain logic.
