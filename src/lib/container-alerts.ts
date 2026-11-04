/**
 * Fleet - which containers need a "down" or "unhealthy" alert.
 * Copyright (c) 2026 Nick Falshaw
 */

import type { ContainerInfo } from "@/lib/fleet-client";

export interface ContainerAlert {
  type: "CONTAINER_DOWN" | "HEALTH_CHECK_FAIL";
  name: string;
  details: string;
}

/**
 * A container that exited or died -> CONTAINER_DOWN.
 * A running container whose health check reports "unhealthy" -> HEALTH_CHECK_FAIL.
 * "created" (never started) and "paused" containers are left alone.
 */
export function containerAlerts(
  containers: Pick<ContainerInfo, "name" | "status" | "state">[],
): ContainerAlert[] {
  const alerts: ContainerAlert[] = [];
  for (const c of containers) {
    if (c.status === "exited" || c.status === "dead") {
      alerts.push({ type: "CONTAINER_DOWN", name: c.name, details: `Container is ${c.status}` });
    } else if (c.status === "running" && c.state === "unhealthy") {
      alerts.push({ type: "HEALTH_CHECK_FAIL", name: c.name, details: "Health check reports unhealthy" });
    }
  }
  return alerts;
}
