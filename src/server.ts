import app from "./app.js";
import { connectDatabase, disconnectDatabase } from "./config/db.js";
import { env } from "./config/env.js";

// Application startup is asynchronous because the database connection must be
// established before the server is ready to handle requests.
async function startServer(): Promise<void> {
  try {
    // Wait for MongoDB first. Calling app.listen() before this resolves could
    // expose endpoints during a period when their database dependency is down.
    await connectDatabase();

    // app.listen() binds Express to a TCP port. The callback runs once the
    // operating system confirms that the server is accepting connections.
    const server = app.listen(env.PORT, () => {
      console.log(`Server running on port ${env.PORT}`);
    });

    let isShuttingDown = false;

    // Stop accepting new requests, wait for active requests to finish, and then
    // close MongoDB. SIGINT comes from Ctrl+C; platforms commonly use SIGTERM
    // when replacing or stopping a deployed process.
    const shutdown = async (signal: string): Promise<void> => {
      if (isShuttingDown) {
        return;
      }

      isShuttingDown = true;
      console.log(`${signal} received; shutting down`);

      try {
        await new Promise<void>((resolve, reject) => {
          server.close((error) => {
            if (error) {
              reject(error);
              return;
            }

            resolve();
          });
        });

        await disconnectDatabase();
      } catch (shutdownError) {
        console.error("Graceful shutdown failed:", shutdownError);
        process.exitCode = 1;
      }
    };

    process.once("SIGINT", () => void shutdown("SIGINT"));
    process.once("SIGTERM", () => void shutdown("SIGTERM"));
  } catch (error) {
    // A startup failure means this process cannot serve the API correctly.
    // Exit code 1 signals failure to shells, containers, and deployment tools.
    console.log("Server failed to start: ", error);
    process.exit(1);
  }
}

// Async functions return promises. `void` documents that this top-level call is
// intentionally not awaited; startServer's try/catch handles startup failures.
void startServer();
