import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  fleetClient,
  type ContainerInfo,
  type ContainerStats,
} from "@/lib/fleet-client";
import {
  matchContainerToApp,
  autoGroupKey,
  autoApp,
  FLEET_APPS,
  sortByCategory,
  type FleetApp,
} from "@/lib/fleet-apps";

export interface AppGroup {
  app: FleetApp;
  containers: (ContainerInfo & { stats?: ContainerStats })[];
  status: "healthy" | "degraded" | "down" | "stopped";
  dbSize?: { name: string; size_mb: number }[];
}

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [containers, batchStats] = await Promise.all([
      fleetClient.getContainers(),
      fleetClient.getBatchStats().catch(() => [] as ContainerStats[]),
    ]);

    const statsMap = new Map<string, ContainerStats>();
    for (const stat of batchStats) {
      statsMap.set(stat.name, stat);
    }

    // Fetch DB sizes for postgres containers
    const pgContainers = containers.filter(
      (c) => c.name.includes("postgres") || /(^|\/)postgres([:@]|$)/.test(c.image ?? ""),
    );
    const dbPromises = pgContainers.map((c) =>
      fleetClient.getDbSize(c.name).catch(() => null),
    );
    const dbResults = await Promise.all(dbPromises);

    const dbMap = new Map<string, { name: string; size_mb: number }[]>();
    pgContainers.forEach((c, i) => {
      const dbs = dbResults[i]?.databases;
      if (dbs) {
        // Skip the empty default "postgres" database when the container has real ones.
        const own = dbs.filter((d) => d.name !== "postgres");
        dbMap.set(c.name, own.length > 0 ? own : dbs);
      }
    });

    // Group containers by app
    const groupMap = new Map<string, AppGroup>();

    // An app can hold several Postgres containers: collect them all.
    const attachDbSize = (group: AppGroup, containerName: string) => {
      const dbs = dbMap.get(containerName);
      if (dbs) group.dbSize = [...(group.dbSize ?? []), ...dbs];
    };

    // Initialize all known apps
    for (const app of FLEET_APPS) {
      groupMap.set(app.id, {
        app,
        containers: [],
        status: "stopped",
      });
    }

    // Assign containers to apps
    const ungrouped: (ContainerInfo & { stats?: ContainerStats })[] = [];

    for (const container of containers) {
      const app = matchContainerToApp(container.name);
      const enriched = { ...container, stats: statsMap.get(container.name) };

      if (app && groupMap.has(app.id)) {
        groupMap.get(app.id)!.containers.push(enriched);

        attachDbSize(groupMap.get(app.id)!, container.name);
      } else {
        // Not in FLEET_APPS: group by Compose project (or name prefix) so every
        // container shows up, not only the hardcoded list.
        const key = autoGroupKey(container.name, container.labels);
        const id = `auto:${key}`;
        if (!groupMap.has(id)) {
          groupMap.set(id, { app: autoApp(key), containers: [], status: "stopped" });
        }
        groupMap.get(id)!.containers.push(enriched);
        attachDbSize(groupMap.get(id)!, container.name);
      }
    }

    // Calculate app status
    for (const group of groupMap.values()) {
      if (group.containers.length === 0) {
        group.status = "stopped";
      } else {
        const states = group.containers.map((c) => c.status);
        const allRunning = states.every((s) => s === "running");
        const anyRunning = states.some((s) => s === "running");

        if (allRunning) {
          // Check health
          const healths = group.containers.map((c) => c.state);
          const anyUnhealthy = healths.some((h) => h === "unhealthy");
          group.status = anyUnhealthy ? "degraded" : "healthy";
        } else if (anyRunning) {
          group.status = "degraded";
        } else {
          group.status = "down";
        }
      }
    }

    // Sort by category
    const groups = Array.from(groupMap.values())
      .filter((g) => g.containers.length > 0)
      .sort((a, b) => sortByCategory(a.app, b.app));

    return NextResponse.json({ groups, ungrouped });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Fleet agent unavailable",
      },
      { status: 502 },
    );
  }
}
