import { getDatabase, isLeadsEnabled } from "@/server/db";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
    const headers = { "Cache-Control": "no-store, max-age=0" };
    if (!isLeadsEnabled())
        return Response.json({ status: "unavailable" }, { status: 503, headers });
    try {
        await getDatabase() `select 1`;
        return Response.json({ status: "healthy" }, { status: 200, headers });
    }
    catch {
        return Response.json({ status: "unhealthy" }, { status: 503, headers });
    }
}
