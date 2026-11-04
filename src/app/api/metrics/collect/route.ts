import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import { fleetClient } from "@/lib/fleet-client";
import { sendAlert } from "@/lib/telegram";
import { containerAlerts } from "@/lib/container-alerts";
import { logger } from "@/lib/logger";

// POST /api/metrics/collect - Collect metrics from all running containers
// Called by cron or manually. Requires CRON_SECRET header for automated calls.
export async function POST(request: Request) {
  // Accept either session auth or cron secret
  const cronSecret = request.headers.get("x-cron-secret");
  const expectedSecret = process.env.CRON_SECRET;

  const secretOk =
    !!cronSecret &&
    !!expectedSecret &&
    cronSecret.length === expectedSecret.length &&
    timingSafeEqual(Buffer.from(cronSecret), Buffer.from(expectedSecret));

  if (!secretOk) {
    // Fallback: try session auth
    const { auth } = await import("@/lib/auth");
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const batchStats = await fleetClient.getBatchStats();

    const metrics = [];
    for (const stat of batchStats) {
      const metric = await prisma.containerMetric.create({
        data: {
          containerName: stat.name,
          cpuPercent: stat.cpu_percent,
          memoryUsedMB: stat.memory_usage_mb,
          memoryLimitMB: stat.memory_limit_mb,
          networkRxMB: stat.network_rx_mb || 0,
          networkTxMB: stat.network_tx_mb || 0,
        },
      });
      metrics.push(metric);

      // Check alert thresholds
      if (stat.cpu_percent > 90) {
        await sendAlert(
          "HIGH_CPU",
          stat.name,
          `CPU at ${stat.cpu_percent.toFixed(1)}%`,
        ).catch((e) => console.error("CPU alert failed:", e));
      }
      if (stat.memory_limit_mb > 0) {
        const memPercent = (stat.memory_usage_mb / stat.memory_limit_mb) * 100;
        if (memPercent > 85) {
          await sendAlert(
            "HIGH_MEMORY",
            stat.name,
            `Memory at ${memPercent.toFixed(1)}% (${stat.memory_usage_mb.toFixed(0)}MB / ${stat.memory_limit_mb.toFixed(0)}MB)`,
          ).catch((e) => console.error("Memory alert failed:", e));
        }
      }
    }

    // Stopped or unhealthy containers (the stats above only cover running ones)
    const containers = await fleetClient.getContainers();
    for (const alert of containerAlerts(containers)) {
      await sendAlert(alert.type, alert.name, alert.details).catch((e) =>
        console.error("Container alert failed:", e),
      );
    }

    // Cleanup old metrics (older than 30 days)
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    const deleted = await prisma.containerMetric.deleteMany({
      where: { recordedAt: { lt: cutoff } },
    });

    return NextResponse.json({
      success: true,
      collected: metrics.length,
      purged: deleted.count,
    });
  } catch (error) {
    logger.error("Metric collection failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Collection failed" },
      { status: 502 },
    );
  }
}
