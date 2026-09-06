import mongoose from "mongoose";
import { env } from "./env.js";

// Open Mongoose's default connection. A Promise<void> tells callers they should
// await completion but that the function does not expose a return value.
export async function connectDatabase(): Promise<void> {
  // mongoose.connect() rejects if the URI is invalid or MongoDB is unreachable;
  // server.ts catches that rejection and prevents a partially ready API.
  await mongoose.connect(env.MONGODB_URI);
  console.log("Mongo Connected");
}

// Close the shared connection cleanly. This will be used by automated tests and
// graceful shutdown so open sockets do not keep the Node.js process alive.
export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
  console.log("Mongo Disconnected");
}
