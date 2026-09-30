/**
 * Starts a local PostgreSQL server for development without Docker or a system install.
 *
 *   npm run db:start
 *
 * Data is stored in ./.postgres-data (git-ignored). Stop with Ctrl+C.
 * Connection string (default): postgresql://academy:academy@localhost:5433/fundamentals_academy
 */
import fs from "node:fs";
import path from "node:path";

const port = Number(process.env.EMBEDDED_PG_PORT ?? 5433);
const database = process.env.EMBEDDED_PG_DATABASE ?? "fundamentals_academy";
const dataDir = path.resolve(process.cwd(), ".postgres-data");

async function main() {
  let EmbeddedPostgres: typeof import("embedded-postgres").default;
  try {
    EmbeddedPostgres = (await import("embedded-postgres")).default;
  } catch {
    console.error(
      "The optional 'embedded-postgres' dependency is not installed for this platform.\n" +
        "Use Docker (docker compose up db) or point DATABASE_URL at your own PostgreSQL server.",
    );
    process.exit(1);
  }

  const pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: "academy",
    password: "academy",
    port,
    persistent: true,
    // UTF-8 regardless of the operating system locale (Windows defaults to WIN1252).
    initdbFlags: ["--encoding=UTF8", "--locale=C"],
    onLog: () => undefined,
  });

  const fresh = !fs.existsSync(path.join(dataDir, "PG_VERSION"));
  if (fresh) {
    console.log(`Initialising a new PostgreSQL cluster in ${dataDir} ...`);
    await pg.initialise();
  }
  await pg.start();
  try {
    await pg.createDatabase(database);
    console.log(`Created database "${database}".`);
  } catch {
    // Database already exists.
  }

  console.log(`PostgreSQL is running on port ${port}.`);
  console.log(`DATABASE_URL=postgresql://academy:academy@localhost:${port}/${database}`);
  console.log("Press Ctrl+C to stop.");

  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    console.log("\nStopping PostgreSQL ...");
    await pg.stop();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  setInterval(() => undefined, 1 << 30);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
