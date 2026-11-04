import { describe, it, expect } from "vitest";
import {
  FLEET_APPS,
  matchContainerToApp,
  getCategoryLabel,
  getCategoryColor,
  getAppIconColors,
  sortByCategory,
  autoGroupKey,
  autoApp,
  type FleetApp,
} from "../src/lib/fleet-apps";

describe("fleet-apps - FLEET_APPS registry", () => {
  it("ships only its own entry; everything else is auto-grouped", () => {
    expect(FLEET_APPS.map((app) => app.id)).toEqual(["fleet"]);
  });

  it("should have valid categories on every app", () => {
    const validCategories = [
      "production",
      "beta",
      "development",
      "infrastructure",
      "monitoring",
    ];
    for (const app of FLEET_APPS) {
      expect(validCategories).toContain(app.category);
    }
  });
});

describe("fleet-apps - matchContainerToApp", () => {
  it("matches a dash prefix (fleet-agent -> fleet)", () => {
    const match = matchContainerToApp("fleet-agent");
    expect(match).toBeDefined();
    expect(match!.id).toBe("fleet");
  });

  it("does not match a name that only shares the word", () => {
    expect(matchContainerToApp("fleetwood")).toBeUndefined();
  });

  it("should return undefined for an unknown container", () => {
    const match = matchContainerToApp("random-unknown-container");
    expect(match).toBeUndefined();
  });
});

describe("fleet-apps - auto grouping", () => {
  it("uses the compose project label first", () => {
    expect(
      autoGroupKey("web-1", { "com.docker.compose.project": "shop" }),
    ).toBe("shop");
  });

  it("falls back to the name before the first dash, then the whole name", () => {
    expect(autoGroupKey("shop-app")).toBe("shop");
    expect(autoGroupKey("redis")).toBe("redis");
  });

  it("builds an 'other' app with a readable name and icon", () => {
    const app = autoApp("my-shop_api");
    expect(app.id).toBe("auto:my-shop_api");
    expect(app.name).toBe("My Shop Api");
    expect(app.category).toBe("other");
    expect(app.icon).toBe("MY");
    expect(getCategoryLabel(app.category)).toBe("Other containers");
  });
});

describe("fleet-apps - getCategoryLabel", () => {
  it("should return 'Production' for production category", () => {
    expect(getCategoryLabel("production")).toBe("Production");
  });

  it("should return 'Beta' for beta category", () => {
    expect(getCategoryLabel("beta")).toBe("Beta");
  });

  it("should return 'Development' for development category", () => {
    expect(getCategoryLabel("development")).toBe("Development");
  });
});

describe("fleet-apps - getCategoryColor", () => {
  it("should return a hex color string for production", () => {
    const color = getCategoryColor("production");
    expect(color).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  it("should return different colors for different categories", () => {
    const prod = getCategoryColor("production");
    const dev = getCategoryColor("development");
    expect(prod).not.toBe(dev);
  });
});

describe("fleet-apps - getAppIconColors", () => {
  it("should return from/to gradient for production", () => {
    const { from, to } = getAppIconColors("production");
    expect(from).toBeDefined();
    expect(to).toBeDefined();
    expect(from).not.toBe(to);
  });
});

describe("fleet-apps - sortByCategory", () => {
  it("should sort production before development", () => {
    const prodApp = { category: "production" } as FleetApp;
    const devApp = { category: "development" } as FleetApp;
    expect(sortByCategory(prodApp, devApp)).toBeLessThan(0);
  });

  it("should sort beta before infrastructure", () => {
    const betaApp = { category: "beta" } as FleetApp;
    const infraApp = { category: "infrastructure" } as FleetApp;
    expect(sortByCategory(betaApp, infraApp)).toBeLessThan(0);
  });

  it("should sort same category as equal", () => {
    const app1 = { category: "development" } as FleetApp;
    const app2 = { category: "development" } as FleetApp;
    expect(sortByCategory(app1, app2)).toBe(0);
  });
});
