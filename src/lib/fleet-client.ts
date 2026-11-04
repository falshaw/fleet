const AGENT_URL = process.env.FLEET_AGENT_URL || "http://fleet-agent:5050";
const AGENT_SECRET = process.env.FLEET_AGENT_SECRET || "";

export interface ContainerInfo {
  id: string;
  name: string;
  image: string;
  status: string;
  state: string;
  created: string;
  ports: string[];
  labels: Record<string, string>;
  started_at: string;
  finished_at: string;
}

export interface ContainerStats {
  name: string;
  status: string;
  cpu_percent: number;
  memory_usage_mb: number;
  memory_limit_mb: number;
  memory_percent: number;
  network_rx_mb?: number;
  network_tx_mb?: number;
}

export interface DbSize {
  container: string;
  databases: {
    name: string;
    size_bytes: number;
    size_mb: number;
  }[];
}

export interface SystemInfo {
  docker_version: string;
  os: string;
  kernel: string;
  cpus: number;
  memory_gb: number;
  containers_total: number;
  containers_running: number;
  containers_stopped: number;
  images_total: number;
  disk_usage: {
    images_gb: number;
    containers_gb: number;
    volumes_gb: number;
    total_gb: number;
  };
}

async function agentFetch<T>(path: string, timeoutMs = 30000): Promise<T> {
  const res = await fetch(`${AGENT_URL}${path}`, {
    next: { revalidate: 0 },
    signal: AbortSignal.timeout(timeoutMs),
    headers: AGENT_SECRET ? { "X-Fleet-Secret": AGENT_SECRET } : {},
  });
  if (!res.ok) {
    throw new Error(`Fleet agent error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export const fleetClient = {
  getContainers: () => agentFetch<ContainerInfo[]>("/api/containers"),
  getContainerLogs: (name: string, lines = 50) =>
    agentFetch<{ name: string; lines: number; logs: string }>(
      `/api/containers/${encodeURIComponent(name)}/logs?lines=${lines}`,
    ),
  getContainerStats: (name: string) =>
    agentFetch<ContainerStats>(
      `/api/containers/${encodeURIComponent(name)}/stats`,
    ),
  getBatchStats: () => agentFetch<ContainerStats[]>("/api/stats/batch", 60000),
  getDbSize: (container: string) =>
    agentFetch<DbSize>(
      `/api/postgres/${encodeURIComponent(container)}/db-size`,
    ),
  getSystem: () => agentFetch<SystemInfo>("/api/system", 60000),
};
