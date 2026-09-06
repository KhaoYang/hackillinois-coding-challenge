// Represent an expected operational error that is safe to send to an API
// client, such as invalid input, a missing resource, or a full shift.
export class AppError extends Error {
  constructor(
    // The HTTP status controls the response status, for example 404 or 409.
    public readonly statusCode: number,

    // The stable machine-readable code lets clients react without parsing the
    // human-readable message, for example "SHIFT_NOT_FOUND".
    public readonly code: string,

    // Error already owns a message property, so this parameter is passed to the
    // built-in Error constructor rather than declared as another class field.
    message: string,

    // Optional structured context, commonly a list of validation problems.
    // `unknown` avoids claiming every error must use the same detail shape.
    public readonly details?: unknown,
  ) {
    // Calling super() initializes Error's message and stack trace. JavaScript
    // requires it before using `this` in a derived class constructor.
    super(message);

    // A specific name makes logs and stack traces easier to recognize.
    this.name = "AppError";
  }
}
