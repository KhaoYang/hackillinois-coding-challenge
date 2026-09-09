const objectIdExample = "66dbb7b2b77145bb72f63a10";

const errorResponse = (description: string) => ({
  description,
  content: {
    "application/json": {
      schema: { $ref: "#/components/schemas/ErrorResponse" },
    },
  },
});

const jsonResponse = (description: string, schema: object) => ({
  description,
  content: {
    "application/json": {
      schema,
    },
  },
});

const paginationParameters = [
  {
    name: "page",
    in: "query",
    description: "One-based page number.",
    schema: { type: "integer", minimum: 1, default: 1 },
  },
  {
    name: "limit",
    in: "query",
    description: "Maximum records returned per page.",
    schema: { type: "integer", minimum: 1, maximum: 100, default: 20 },
  },
];

const signupStatusParameter = {
  name: "status",
  in: "query",
  schema: {
    type: "string",
    enum: ["CONFIRMED", "CANCELLED"],
    default: "CONFIRMED",
  },
};

// The OpenAPI document is kept in source control beside the API. Reviewers can
// inspect it as JSON or use the Swagger UI to execute requests in a browser.
export const openApiDocument = {
  openapi: "3.0.3",
  info: {
    title: "HackIllinois Staff Shift API",
    version: "1.0.0",
    description:
      "Create staff and event shifts, manage capacity-safe signups, and report staff who have not met their shift commitment.",
  },
  servers: [{ url: "/", description: "Current server" }],
  tags: [
    { name: "System" },
    { name: "Staff" },
    { name: "Shifts" },
    { name: "Signups" },
  ],
  paths: {
    "/health": {
      get: {
        tags: ["System"],
        summary: "Check API liveness",
        responses: {
          "200": jsonResponse("The API process is running.", {
            type: "object",
            properties: {
              data: {
                type: "object",
                properties: { status: { type: "string", example: "ok" } },
                required: ["status"],
              },
            },
            required: ["data"],
          }),
        },
      },
    },
    "/api/v1/volunteers": {
      get: {
        tags: ["Staff"],
        summary: "List and filter staff members",
        parameters: [
          {
            name: "team",
            in: "query",
            schema: { $ref: "#/components/schemas/StaffTeam" },
          },
          ...paginationParameters,
        ],
        responses: {
          "200": jsonResponse("Matching staff members.", {
            $ref: "#/components/schemas/VolunteerListEnvelope",
          }),
          "400": errorResponse("One or more query parameters are invalid."),
        },
      },
      post: {
        tags: ["Staff"],
        summary: "Create a staff member",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateVolunteer" },
              example: {
                name: "Maya Chen",
                email: "maya.chen@example.com",
                phone: "217-555-0101",
                team: "SYSTEMS",
                requiredShiftCount: 3,
              },
            },
          },
        },
        responses: {
          "201": jsonResponse("Staff member created.", {
            $ref: "#/components/schemas/VolunteerEnvelope",
          }),
          "400": errorResponse("The request body is invalid."),
          "409": errorResponse("A staff member already uses this email."),
        },
      },
    },
    "/api/v1/volunteers/undercommitted": {
      get: {
        tags: ["Staff"],
        summary: "List staff below their required shift count",
        parameters: [
          {
            name: "team",
            in: "query",
            schema: { $ref: "#/components/schemas/StaffTeam" },
          },
          ...paginationParameters,
        ],
        responses: {
          "200": jsonResponse(
            "Undercommitted staff ordered by remaining shifts.",
            {
              allOf: [
                { $ref: "#/components/schemas/PaginatedEnvelope" },
                {
                  type: "object",
                  properties: {
                    data: {
                      type: "array",
                      items: {
                        $ref: "#/components/schemas/UndercommittedVolunteer",
                      },
                    },
                  },
                },
              ],
            },
          ),
          "400": errorResponse("One or more query parameters are invalid."),
        },
      },
    },
    "/api/v1/volunteers/{volunteerId}": {
      get: {
        tags: ["Staff"],
        summary: "Get one staff member",
        parameters: [{ $ref: "#/components/parameters/VolunteerId" }],
        responses: {
          "200": jsonResponse("The requested staff member.", {
            $ref: "#/components/schemas/VolunteerEnvelope",
          }),
          "400": errorResponse("The ID is malformed."),
          "404": errorResponse("The staff member does not exist."),
        },
      },
    },
    "/api/v1/volunteers/{volunteerId}/signups": {
      get: {
        tags: ["Signups"],
        summary: "List one staff member's signup history",
        parameters: [
          { $ref: "#/components/parameters/VolunteerId" },
          signupStatusParameter,
          ...paginationParameters,
        ],
        responses: {
          "200": jsonResponse("The staff member's signups.", {
            $ref: "#/components/schemas/SignupListEnvelope",
          }),
          "400": errorResponse("An ID or query parameter is invalid."),
          "404": errorResponse("The staff member does not exist."),
        },
      },
    },
    "/api/v1/shifts": {
      post: {
        tags: ["Shifts"],
        summary: "Create a shift",
        description: "An OPEN shift must begin in the future.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateShift" },
              example: {
                title: "Registration Desk",
                description: "Welcome attendees and distribute badges.",
                location: "Siebel Center Lobby",
                startAt: "2030-02-23T15:00:00.000Z",
                endAt: "2030-02-23T17:00:00.000Z",
                capacity: 4,
                minimumStaff: 2,
                status: "OPEN",
              },
            },
          },
        },
        responses: {
          "201": jsonResponse("Shift created.", {
            $ref: "#/components/schemas/ShiftEnvelope",
          }),
          "400": errorResponse("The request body is invalid."),
          "409": errorResponse("The OPEN shift has already started."),
        },
      },
      get: {
        tags: ["Shifts"],
        summary: "Filter and paginate shifts",
        description:
          "The time filters return shifts that intersect the requested window.",
        parameters: [
          {
            name: "status",
            in: "query",
            schema: { $ref: "#/components/schemas/ShiftStatus" },
          },
          {
            name: "from",
            in: "query",
            schema: { type: "string", format: "date-time" },
          },
          {
            name: "to",
            in: "query",
            schema: { type: "string", format: "date-time" },
          },
          ...paginationParameters,
        ],
        responses: {
          "200": jsonResponse("Matching shifts.", {
            $ref: "#/components/schemas/ShiftListEnvelope",
          }),
          "400": errorResponse("One or more query parameters are invalid."),
        },
      },
    },
    "/api/v1/shifts/understaffed": {
      get: {
        tags: ["Shifts"],
        summary: "List open shifts below minimum staffing",
        description:
          "Returns future OPEN shifts where confirmedCount is below minimumStaff, ordered by the largest staffing gap. Time filters use interval intersection.",
        parameters: [
          {
            name: "from",
            in: "query",
            schema: { type: "string", format: "date-time" },
          },
          {
            name: "to",
            in: "query",
            schema: { type: "string", format: "date-time" },
          },
          ...paginationParameters,
        ],
        responses: {
          "200": jsonResponse("Understaffed shifts.", {
            $ref: "#/components/schemas/ShiftListEnvelope",
          }),
          "400": errorResponse("One or more query parameters are invalid."),
        },
      },
    },
    "/api/v1/shifts/{shiftId}": {
      get: {
        tags: ["Shifts"],
        summary: "Get one shift",
        parameters: [{ $ref: "#/components/parameters/ShiftId" }],
        responses: {
          "200": jsonResponse("The requested shift.", {
            $ref: "#/components/schemas/ShiftEnvelope",
          }),
          "400": errorResponse("The ID is malformed."),
          "404": errorResponse("The shift does not exist."),
        },
      },
      patch: {
        tags: ["Shifts"],
        summary: "Update a shift or its lifecycle status",
        description:
          "Times are locked once signups exist. Cancelled shifts cannot be reopened.",
        parameters: [{ $ref: "#/components/parameters/ShiftId" }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/UpdateShift" },
              example: { capacity: 6, status: "OPEN" },
            },
          },
        },
        responses: {
          "200": jsonResponse("Shift updated.", {
            $ref: "#/components/schemas/ShiftEnvelope",
          }),
          "400": errorResponse("The ID or request body is invalid."),
          "404": errorResponse("The shift does not exist."),
          "409": errorResponse("The requested change violates a shift rule."),
        },
      },
      delete: {
        tags: ["Shifts"],
        summary: "Delete an unused draft shift",
        parameters: [{ $ref: "#/components/parameters/ShiftId" }],
        responses: {
          "204": { description: "Shift deleted." },
          "400": errorResponse("The ID is malformed."),
          "404": errorResponse("The shift does not exist."),
          "409": errorResponse("Only an unused DRAFT shift can be deleted."),
        },
      },
    },
    "/api/v1/shifts/{shiftId}/signups": {
      post: {
        tags: ["Signups"],
        summary: "Sign a staff member up for a shift",
        description:
          "The operation is idempotent and rejects full, non-open, past, or overlapping shifts.",
        parameters: [{ $ref: "#/components/parameters/ShiftId" }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateSignup" },
            },
          },
        },
        responses: {
          "201": jsonResponse("Signup created.", {
            $ref: "#/components/schemas/SignupEnvelope",
          }),
          "200": jsonResponse("The existing signup was returned.", {
            $ref: "#/components/schemas/SignupEnvelope",
          }),
          "400": errorResponse("An ID or request body is invalid."),
          "404": errorResponse("The shift or staff member does not exist."),
          "409": errorResponse("A signup business rule was violated."),
        },
      },
      get: {
        tags: ["Signups"],
        summary: "List signups for a shift",
        parameters: [
          { $ref: "#/components/parameters/ShiftId" },
          signupStatusParameter,
          ...paginationParameters,
        ],
        responses: {
          "200": jsonResponse("The shift's signups.", {
            $ref: "#/components/schemas/SignupListEnvelope",
          }),
          "400": errorResponse("An ID or query parameter is invalid."),
          "404": errorResponse("The shift does not exist."),
        },
      },
    },
    "/api/v1/shifts/{shiftId}/signups/{volunteerId}": {
      delete: {
        tags: ["Signups"],
        summary: "Cancel a signup",
        description: "Repeating a completed cancellation is safe.",
        parameters: [
          { $ref: "#/components/parameters/ShiftId" },
          { $ref: "#/components/parameters/VolunteerId" },
        ],
        responses: {
          "204": { description: "Signup cancelled." },
          "400": errorResponse("An ID is malformed."),
          "404": errorResponse(
            "The shift, staff member, or signup does not exist.",
          ),
        },
      },
    },
  },
  components: {
    parameters: {
      VolunteerId: {
        name: "volunteerId",
        in: "path",
        required: true,
        schema: { type: "string", pattern: "^[0-9a-fA-F]{24}$" },
        example: objectIdExample,
      },
      ShiftId: {
        name: "shiftId",
        in: "path",
        required: true,
        schema: { type: "string", pattern: "^[0-9a-fA-F]{24}$" },
        example: objectIdExample,
      },
    },
    schemas: {
      StaffTeam: {
        type: "string",
        enum: ["EXPERIENCE", "OUTREACH", "SYSTEMS", "DESIGN"],
      },
      ShiftStatus: {
        type: "string",
        enum: ["DRAFT", "OPEN", "CLOSED", "CANCELLED"],
      },
      SignupStatus: {
        type: "string",
        enum: ["CONFIRMED", "CANCELLED"],
      },
      CreateVolunteer: {
        type: "object",
        additionalProperties: false,
        required: ["name", "email", "team"],
        properties: {
          name: { type: "string", minLength: 2, maxLength: 50 },
          email: { type: "string", format: "email" },
          phone: { type: "string", minLength: 7, maxLength: 15 },
          team: { $ref: "#/components/schemas/StaffTeam" },
          requiredShiftCount: {
            type: "integer",
            minimum: 0,
            maximum: 100,
            default: 0,
          },
        },
      },
      Volunteer: {
        type: "object",
        required: [
          "id",
          "name",
          "email",
          "team",
          "requiredShiftCount",
          "createdAt",
          "updatedAt",
        ],
        properties: {
          id: { type: "string", example: objectIdExample },
          name: { type: "string", example: "Maya Chen" },
          email: { type: "string", format: "email" },
          phone: { type: "string" },
          team: { $ref: "#/components/schemas/StaffTeam" },
          requiredShiftCount: { type: "integer" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      UndercommittedVolunteer: {
        type: "object",
        required: [
          "id",
          "name",
          "email",
          "team",
          "requiredShiftCount",
          "confirmedShiftCount",
          "remainingShiftCount",
        ],
        properties: {
          id: { type: "string", example: objectIdExample },
          name: { type: "string", example: "Maya Chen" },
          email: { type: "string", format: "email" },
          phone: { type: "string" },
          team: { $ref: "#/components/schemas/StaffTeam" },
          requiredShiftCount: { type: "integer", example: 3 },
          confirmedShiftCount: { type: "integer", example: 1 },
          remainingShiftCount: { type: "integer", example: 2 },
        },
      },
      CreateShift: {
        type: "object",
        additionalProperties: false,
        required: [
          "title",
          "description",
          "location",
          "startAt",
          "endAt",
          "capacity",
        ],
        properties: {
          title: { type: "string", minLength: 2, maxLength: 100 },
          description: { type: "string", minLength: 1, maxLength: 1000 },
          location: { type: "string", minLength: 2, maxLength: 150 },
          startAt: { type: "string", format: "date-time" },
          endAt: { type: "string", format: "date-time" },
          capacity: { type: "integer", minimum: 1, maximum: 10000 },
          minimumStaff: {
            type: "integer",
            minimum: 1,
            maximum: 10000,
            default: 1,
            description: "Required coverage target; cannot exceed capacity.",
          },
          status: {
            type: "string",
            enum: ["DRAFT", "OPEN"],
            default: "DRAFT",
          },
        },
      },
      UpdateShift: {
        type: "object",
        additionalProperties: false,
        minProperties: 1,
        properties: {
          title: { type: "string", minLength: 2, maxLength: 100 },
          description: { type: "string", minLength: 1, maxLength: 1000 },
          location: { type: "string", minLength: 2, maxLength: 150 },
          startAt: { type: "string", format: "date-time" },
          endAt: { type: "string", format: "date-time" },
          capacity: { type: "integer", minimum: 1, maximum: 10000 },
          minimumStaff: { type: "integer", minimum: 1, maximum: 10000 },
          status: { $ref: "#/components/schemas/ShiftStatus" },
        },
      },
      Shift: {
        type: "object",
        required: [
          "id",
          "title",
          "description",
          "location",
          "startAt",
          "endAt",
          "capacity",
          "minimumStaff",
          "confirmedCount",
          "spotsRemaining",
          "staffNeeded",
          "status",
          "createdAt",
          "updatedAt",
        ],
        properties: {
          id: { type: "string", example: objectIdExample },
          title: { type: "string", example: "Registration Desk" },
          description: { type: "string" },
          location: { type: "string", example: "Siebel Center Lobby" },
          startAt: { type: "string", format: "date-time" },
          endAt: { type: "string", format: "date-time" },
          capacity: { type: "integer" },
          minimumStaff: { type: "integer" },
          confirmedCount: { type: "integer" },
          spotsRemaining: { type: "integer" },
          staffNeeded: {
            type: "integer",
            description:
              "Additional confirmed staff needed to meet minimumStaff.",
          },
          status: { $ref: "#/components/schemas/ShiftStatus" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      CreateSignup: {
        type: "object",
        additionalProperties: false,
        required: ["volunteerId"],
        properties: {
          volunteerId: { type: "string", example: objectIdExample },
        },
      },
      Signup: {
        type: "object",
        required: [
          "id",
          "shiftId",
          "volunteerId",
          "status",
          "signedUpAt",
          "createdAt",
          "updatedAt",
        ],
        properties: {
          id: { type: "string", example: objectIdExample },
          shiftId: { type: "string", example: objectIdExample },
          volunteerId: { type: "string", example: objectIdExample },
          status: { $ref: "#/components/schemas/SignupStatus" },
          signedUpAt: { type: "string", format: "date-time" },
          cancelledAt: { type: "string", format: "date-time" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      Pagination: {
        type: "object",
        required: ["page", "limit", "totalItems", "totalPages"],
        properties: {
          page: { type: "integer", example: 1 },
          limit: { type: "integer", example: 20 },
          totalItems: { type: "integer", example: 4 },
          totalPages: { type: "integer", example: 1 },
        },
      },
      PaginatedEnvelope: {
        type: "object",
        required: ["data", "pagination"],
        properties: {
          data: { type: "array", items: {} },
          pagination: { $ref: "#/components/schemas/Pagination" },
        },
      },
      VolunteerEnvelope: {
        type: "object",
        required: ["data"],
        properties: { data: { $ref: "#/components/schemas/Volunteer" } },
      },
      VolunteerListEnvelope: {
        allOf: [
          { $ref: "#/components/schemas/PaginatedEnvelope" },
          {
            type: "object",
            properties: {
              data: {
                type: "array",
                items: { $ref: "#/components/schemas/Volunteer" },
              },
            },
          },
        ],
      },
      ShiftEnvelope: {
        type: "object",
        required: ["data"],
        properties: { data: { $ref: "#/components/schemas/Shift" } },
      },
      SignupEnvelope: {
        type: "object",
        required: ["data"],
        properties: { data: { $ref: "#/components/schemas/Signup" } },
      },
      ShiftListEnvelope: {
        allOf: [
          { $ref: "#/components/schemas/PaginatedEnvelope" },
          {
            type: "object",
            properties: {
              data: {
                type: "array",
                items: { $ref: "#/components/schemas/Shift" },
              },
            },
          },
        ],
      },
      SignupListEnvelope: {
        allOf: [
          { $ref: "#/components/schemas/PaginatedEnvelope" },
          {
            type: "object",
            properties: {
              data: {
                type: "array",
                items: { $ref: "#/components/schemas/Signup" },
              },
            },
          },
        ],
      },
      ErrorResponse: {
        type: "object",
        required: ["error"],
        properties: {
          error: {
            type: "object",
            required: ["code", "message"],
            properties: {
              code: { type: "string", example: "SHIFT_FULL" },
              message: {
                type: "string",
                example: "This shift has reached capacity",
              },
              details: { type: "array", items: { type: "object" } },
            },
          },
        },
      },
    },
  },
} as const;
