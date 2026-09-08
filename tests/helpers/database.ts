import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";

let replicaSet: MongoMemoryReplSet | undefined;

// Start a real, temporary MongoDB replica set for integration tests. A replica
// set is important because the signup workflow will use database transactions.
export async function startTestDatabase(): Promise<void> {
  replicaSet = await MongoMemoryReplSet.create({
    replSet: {
      count: 1,
      storageEngine: "wiredTiger",
    },
  });

  // getUri() always points to the temporary test database, never the MongoDB
  // connection string from the developer's .env file.
  await mongoose.connect(replicaSet.getUri(), {
    dbName: "volunteer-api-test",
  });
}

// Remove documents between tests while retaining collections and indexes. This
// gives every test isolated data without repeatedly restarting MongoDB.
export async function clearTestDatabase(): Promise<void> {
  const collections = Object.values(mongoose.connection.collections);

  await Promise.all(collections.map((collection) => collection.deleteMany({})));
}

// Release both Mongoose's client connection and the temporary MongoDB process
// so the test runner can exit normally.
export async function stopTestDatabase(): Promise<void> {
  await mongoose.disconnect();
  await replicaSet?.stop();
  replicaSet = undefined;
}
