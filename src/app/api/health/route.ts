import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest): Promise<NextResponse> {
  void request;
  const startTime = Date.now();
  let dbStatus = "unknown";

  try {
    // Quick query read-only SELECT 1 to verify database responsiveness
    await prisma.$queryRaw`SELECT 1 as ok`;
    dbStatus = "connected";
  } catch (error) {
    console.error("[Healthcheck Error]", error);
    dbStatus = "disconnected";
  }

  const isHealthy = dbStatus === "connected";
  const responsePayload = {
    status: isHealthy ? "healthy" : "degraded",
    database: dbStatus,
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    latencyMs: Date.now() - startTime,
  };

  return NextResponse.json(responsePayload, {
    status: isHealthy ? 200 : 503,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}
