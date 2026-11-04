import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/metrics/[container] - Get historical metrics for a container
export async function GET(
  request: Request,
  { params }: { params: Promise<{ container: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { container } = await params;
  const { searchParams } = new URL(request.url);
  const range = searchParams.get("range") || "24h";

  // Calculate time range
  const now = new Date();
  let since: Date;
  switch (range) {
    case "7d":
      since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case "30d":
      since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    case "24h":
    default:
      since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      break;
  }

  const metrics = await prisma.containerMetric.findMany({
    where: {
      containerName: container,
      recordedAt: { gte: since },
    },
    orderBy: { recordedAt: "asc" },
    select: {
      cpuPercent: true,
      memoryUsedMB: true,
      memoryLimitMB: true,
      networkRxMB: true,
      networkTxMB: true,
      recordedAt: true,
    },
  });

  return NextResponse.json({
    container,
    range,
    dataPoints: metrics.length,
    metrics,
  });
}
