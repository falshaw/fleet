import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/alerts/history - Get recent alert history
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 200);

  const logs = await prisma.alertLog.findMany({
    orderBy: { sentAt: "desc" },
    take: limit,
  });

  return NextResponse.json({ alerts: logs, count: logs.length });
}
