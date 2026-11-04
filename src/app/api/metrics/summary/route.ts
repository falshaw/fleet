import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/metrics/summary - Fleet-wide metrics summary
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const range = searchParams.get("range") || "24h";

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

  // Get aggregate stats
  const aggregates = await prisma.containerMetric.aggregate({
    where: { recordedAt: { gte: since } },
    _avg: {
      cpuPercent: true,
      memoryUsedMB: true,
    },
    _max: {
      cpuPercent: true,
      memoryUsedMB: true,
    },
    _count: true,
  });

  // Get unique containers tracked
  const containers = await prisma.containerMetric.groupBy({
    by: ["containerName"],
    where: { recordedAt: { gte: since } },
    _avg: {
      cpuPercent: true,
      memoryUsedMB: true,
    },
    _max: {
      cpuPercent: true,
      memoryUsedMB: true,
    },
    _count: true,
  });

  // Get total data points over time (bucketed per hour for charts)
  const recentMetrics = await prisma.containerMetric.findMany({
    where: { recordedAt: { gte: since } },
    orderBy: { recordedAt: "asc" },
    select: {
      cpuPercent: true,
      memoryUsedMB: true,
      recordedAt: true,
    },
  });

  // Bucket by hour
  const hourlyBuckets: Record<string, { cpu: number[]; mem: number[] }> = {};
  for (const m of recentMetrics) {
    const hour = new Date(m.recordedAt).toISOString().slice(0, 13);
    if (!hourlyBuckets[hour]) hourlyBuckets[hour] = { cpu: [], mem: [] };
    hourlyBuckets[hour].cpu.push(m.cpuPercent);
    hourlyBuckets[hour].mem.push(m.memoryUsedMB);
  }

  const timeline = Object.entries(hourlyBuckets)
    .map(([hour, data]) => ({
      time: hour + ":00:00.000Z",
      avgCpu: data.cpu.reduce((a, b) => a + b, 0) / data.cpu.length,
      avgMemoryMB: data.mem.reduce((a, b) => a + b, 0) / data.mem.length,
      containerCount: new Set(data.cpu).size,
    }))
    .sort((a, b) => a.time.localeCompare(b.time));

  return NextResponse.json({
    range,
    totalDataPoints: aggregates._count,
    containerCount: containers.length,
    fleet: {
      avgCpuPercent: aggregates._avg.cpuPercent || 0,
      avgMemoryMB: aggregates._avg.memoryUsedMB || 0,
      peakCpuPercent: aggregates._max.cpuPercent || 0,
      peakMemoryMB: aggregates._max.memoryUsedMB || 0,
    },
    containers: containers.map((c) => ({
      name: c.containerName,
      avgCpu: c._avg.cpuPercent || 0,
      avgMemoryMB: c._avg.memoryUsedMB || 0,
      peakCpu: c._max.cpuPercent || 0,
      peakMemoryMB: c._max.memoryUsedMB || 0,
      dataPoints: c._count,
    })),
    timeline,
  });
}
