export interface FleetApp {
  id: string;
  name: string;
  prefix: string;
  category:
    | "production"
    | "beta"
    | "development"
    | "infrastructure"
    | "monitoring"
    | "other";
  port?: number;
  url?: string;
  description: string;
  icon: string;
}

export const FLEET_APPS: FleetApp[] = [
  // Optional: pin a name, category, port and icon for containers whose names
  // start with a prefix. Anything not listed here is still shown, grouped by
  // its Docker Compose project. Example:
  //
  // {
  //   id: "shop",
  //   name: "Shop",
  //   prefix: "shop-",
  //   category: "production",
  //   port: 8080,
  //   description: "Online shop",
  //   icon: "SH",
  // },
  {
    id: "fleet",
    name: "Fleet",
    prefix: "fleet-",
    category: "infrastructure",
    port: 3008,
    description: "This dashboard",
    icon: "FL",
  },
];

const CATEGORY_ORDER: Record<string, number> = {
  production: 0,
  beta: 1,
  development: 2,
  infrastructure: 3,
  monitoring: 4,
  other: 5,
};

export function matchContainerToApp(
  containerName: string,
): FleetApp | undefined {
  return FLEET_APPS.find((app) => {
    if (app.prefix.endsWith("-")) {
      return containerName.startsWith(app.prefix);
    }
    return (
      containerName === app.prefix || containerName.startsWith(app.prefix + "-")
    );
  });
}

export function getCategoryLabel(category: FleetApp["category"]): string {
  const labels: Record<string, string> = {
    production: "Production",
    beta: "Beta",
    development: "Development",
    infrastructure: "Infrastructure",
    monitoring: "Monitoring",
    other: "Other containers",
  };
  return labels[category] || category;
}

export function getCategoryColor(category: FleetApp["category"]): string {
  const colors: Record<string, string> = {
    production: "#10b981",
    beta: "#f59e0b",
    development: "#3b82f6",
    infrastructure: "#a78bfa",
    monitoring: "#6b7280",
  };
  return colors[category] || "#6b7280";
}

export function getAppIconColors(category: FleetApp["category"]): {
  from: string;
  to: string;
} {
  const gradients: Record<string, { from: string; to: string }> = {
    production: { from: "#10b981", to: "#059669" },
    beta: { from: "#f59e0b", to: "#d97706" },
    development: { from: "#3b82f6", to: "#2563eb" },
    infrastructure: { from: "#a78bfa", to: "#7c3aed" },
    monitoring: { from: "#6b7280", to: "#4b5563" },
  };
  return gradients[category] || gradients.monitoring;
}

export function sortByCategory(a: FleetApp, b: FleetApp): number {
  return (
    (CATEGORY_ORDER[a.category] ?? 99) - (CATEGORY_ORDER[b.category] ?? 99)
  );
}

/**
 * Group key for a container that matches no FLEET_APPS entry: its Docker Compose
 * project label, else the name up to the first "-", else the whole name.
 */
export function autoGroupKey(
  name: string,
  labels: Record<string, string> = {},
): string {
  const project = labels["com.docker.compose.project"]?.trim();
  if (project) return project;
  const dash = name.indexOf("-");
  return dash > 0 ? name.slice(0, dash) : name;
}

/** A FleetApp built on the fly for containers outside FLEET_APPS. */
export function autoApp(key: string): FleetApp {
  const words = key.replace(/[_-]+/g, " ").trim();
  return {
    id: `auto:${key}`,
    name: words.replace(/\b\w/g, (c) => c.toUpperCase()),
    prefix: key,
    category: "other",
    description: "Docker Compose project",
    icon: words.replace(/\s+/g, "").slice(0, 2).toUpperCase() || "??",
  };
}
