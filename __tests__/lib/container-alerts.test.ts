import { describe, it, expect } from "vitest";
import { containerAlerts } from "@/lib/container-alerts";

describe("containerAlerts", () => {
  it("flags exited and dead containers as down", () => {
    const a = containerAlerts([
      { name: "shop-worker", status: "exited", state: "exited" },
      { name: "shop-db", status: "dead", state: "dead" },
    ]);
    expect(a.map((x) => [x.type, x.name])).toEqual([
      ["CONTAINER_DOWN", "shop-worker"],
      ["CONTAINER_DOWN", "shop-db"],
    ]);
  });

  it("flags running containers whose health check fails", () => {
    const a = containerAlerts([{ name: "shop-web", status: "running", state: "unhealthy" }]);
    expect(a).toEqual([
      { type: "HEALTH_CHECK_FAIL", name: "shop-web", details: "Health check reports unhealthy" },
    ]);
  });

  it("ignores healthy, starting, created and paused containers", () => {
    expect(
      containerAlerts([
        { name: "a", status: "running", state: "healthy" },
        { name: "b", status: "running", state: "starting" },
        { name: "c", status: "running", state: "running" },
        { name: "d", status: "created", state: "created" },
        { name: "e", status: "paused", state: "paused" },
      ]),
    ).toEqual([]);
  });
});
