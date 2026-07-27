import "server-only";
import postgres from "postgres";
type DatabaseClient = ReturnType<typeof postgres>;
const globalDatabase = globalThis as typeof globalThis & {
    __tascDatabase?: DatabaseClient;
};
export function isLeadsEnabled() {
    return process.env.LEADS_ENABLED === "true";
}
export function getDatabase(): DatabaseClient {
    if (globalDatabase.__tascDatabase)
        return globalDatabase.__tascDatabase;
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl)
        throw new Error("DATABASE_URL is not configured");
    const client = postgres(databaseUrl, {
        max: 3,
        idle_timeout: 20,
        connect_timeout: 5,
        prepare: false,
        onnotice: () => undefined,
    });
    globalDatabase.__tascDatabase = client;
    return client;
}
