"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { RefreshCw, Server, MemoryStick, HardDrive } from "lucide-react";
import { AppCard } from "@/components/AppCard";
import { ContainerDetail } from "@/components/ContainerDetail";
import type { AppGroup } from "@/app/api/fleet/containers/route";

interface SystemInfo {
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

interface DeployAction {
  id: string;
  containerName: string;
  action: string;
  status: string;
  triggeredBy: string;
  startedAt: string;
  completedAt: string | null;
}

const ACTION_PILL: Record<string, string> = {
  SUCCESS: "p-ok",
  COMPLETED: "p-ok",
  FAILED: "p-risk",
  PENDING: "p-pend",
  RUNNING: "p-pend",
};

function cpuOf(g: AppGroup) {
  return g.containers.reduce((s, c) => s + (c.stats?.cpu_percent || 0), 0);
}
function memOf(g: AppGroup) {
  return g.containers.reduce((s, c) => s + (c.stats?.memory_usage_mb || 0), 0);
}
function memLimitOf(g: AppGroup) {
  return g.containers.reduce((s, c) => s + (c.stats?.memory_limit_mb || 0), 0);
}
function fmtMb(mb: number) {
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb.toFixed(0)} MB`;
}
function fmtTime(iso: string) {
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  return today
    ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString([], { day: "numeric", month: "short" });
}

/** Ring with healthy (teal) and degraded (amber) arcs; the rest is track. */
function HealthRing({
  healthy,
  degraded,
  total,
}: {
  healthy: number;
  degraded: number;
  total: number;
}) {
  const C = 2 * Math.PI * 58;
  const h = total ? (healthy / total) * C : 0;
  const d = total ? (degraded / total) * C : 0;
  return (
    <svg
      width="150"
      height="150"
      viewBox="0 0 150 150"
      className="shrink-0"
      role="img"
      aria-label={`${healthy} of ${total} apps healthy`}
    >
      <circle cx="75" cy="75" r="58" fill="none" stroke="var(--track)" strokeWidth="16" />
      {h > 0 && (
        <circle
          cx="75"
          cy="75"
          r="58"
          fill="none"
          stroke="#14b8a6"
          strokeWidth="16"
          strokeLinecap="round"
          strokeDasharray={`${h} ${C - h}`}
          transform="rotate(-90 75 75)"
        />
      )}
      {d > 0 && (
        <circle
          cx="75"
          cy="75"
          r="58"
          fill="none"
          stroke="#d97706"
          strokeWidth="16"
          strokeLinecap="round"
          strokeDasharray={`${d} ${C - d}`}
          strokeDashoffset={-h}
          transform="rotate(-90 75 75)"
        />
      )}
      <text x="75" y="76" textAnchor="middle" fontWeight="700" fontSize="28" fill="var(--ink)">
        {healthy}/{total}
      </text>
      <text x="75" y="96" textAnchor="middle" fontSize="11" fill="var(--ink-45)">
        apps healthy
      </text>
    </svg>
  );
}

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const [groups, setGroups] = useState<AppGroup[]>([]);
  const [system, setSystem] = useState<SystemInfo | null>(null);
  const [actions, setActions] = useState<DeployAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>("");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [logsFor, setLogsFor] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [containersRes, systemRes, actionsRes] = await Promise.all([
        fetch("/api/fleet/containers"),
        fetch("/api/fleet/system"),
        fetch("/api/deploy/history?limit=5"),
      ]);

      if (containersRes.ok) {
        const data = await containersRes.json();
        setGroups(data.groups || []);
        setError(null);
      } else {
        const data = await containersRes.json().catch(() => ({}));
        setError(data.error || "Failed to fetch containers");
      }
      if (systemRes.ok) setSystem(await systemRes.json());
      if (actionsRes.ok) setActions((await actionsRes.json()).actions || []);

      setLastUpdated(new Date().toLocaleTimeString());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "authenticated") fetchData();
  }, [status, fetchData]);

  useEffect(() => {
    if (!autoRefresh || status !== "authenticated") return;
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [autoRefresh, status, fetchData]);

  if (status === "loading") {
    return (
      <div className="grid min-h-[50vh] place-items-center">
        <RefreshCw className="h-6 w-6 animate-spin text-accent" aria-label="Loading" />
      </div>
    );
  }
  if (!session?.user) return null;

  const healthy = groups.filter((g) => g.status === "healthy").length;
  const degraded = groups.filter((g) => g.status === "degraded").length;
  const stopped = groups.length - healthy - degraded;
  const running = groups.filter((g) => g.status === "healthy" || g.status === "degraded");

  const byCpu = [...running].sort((a, b) => cpuOf(b) - cpuOf(a)).slice(0, 8);
  const maxCpu = Math.max(...byCpu.map(cpuOf), 1);
  const byMem = [...running].sort((a, b) => memOf(b) - memOf(a)).slice(0, 8);
  const dbs = groups
    .flatMap((g) => g.dbSize ?? [])
    .sort((a, b) => b.size_mb - a.size_mb)
    .slice(0, 5);
  const maxDb = Math.max(...dbs.map((d) => d.size_mb), 1);
  const memUsedGb = running.reduce((s, g) => s + memOf(g), 0) / 1024;

  // Only a half-running app needs attention; a fully stopped stack is a choice.
  const problem = groups.find((g) => g.status === "degraded");
  const problemContainer = problem?.containers.find((c) => c.status !== "running") ?? problem?.containers[0];

  const dateLine = new Date().toLocaleDateString([], {
    weekday: "short",
    day: "numeric",
    month: "short",
  });

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="eyebrow">
            {dateLine}
            {lastUpdated && ` · updated ${lastUpdated}`}
          </div>
          <h1 className="!text-[28px]">Fleet</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          {system && (
            <span className="pillbox hidden md:inline-flex">
              Docker {system.docker_version} · {system.cpus} CPUs · {system.memory_gb} GB
            </span>
          )}
          <label className="pillbox cursor-pointer">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="accent-[var(--accent)]"
            />
            Auto-refresh 30 s
          </label>
          <button
            type="button"
            onClick={fetchData}
            className="btn btn-primary !h-[38px]"
            disabled={loading}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} aria-hidden />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="alert alert-error mb-4" role="alert">
          <b>{error}</b> Make sure the fleet-agent container is running.
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[1.25fr_.75fr_1.1fr]">
        <div className="tile md:col-span-2 xl:col-span-1">
          <div className="mb-3.5 flex items-center justify-between">
            <h2 className="!text-base">CPU by app</h2>
            <span className="text-xs text-ink-65">now, % of one core</span>
          </div>
          {byCpu.length === 0 ? (
            <p className="text-sm text-ink-65">{loading ? "Loading…" : "Nothing running."}</p>
          ) : (
            <div className="vbars">
              {byCpu.map((g) => {
                const v = cpuOf(g);
                const pct = Math.round((v / maxCpu) * 100);
                return (
                  <div key={g.app.id}>
                    <div className={`col ${g.status === "degraded" ? "warn" : ""}`}>
                      <b style={{ height: `${Math.max(pct, 2)}%` }} />
                      {pct > 85 ? (
                        <span style={{ top: 8, color: "#fff" }}>{v.toFixed(1)}</span>
                      ) : (
                        <span style={{ bottom: `calc(${pct}% + 6px)` }}>{v.toFixed(1)}</span>
                      )}
                    </div>
                    <small title={g.app.name}>{g.app.name}</small>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="grid gap-3">
          <div className="tile flex items-center gap-3">
            <span className="stat-i text-accent"><Server aria-hidden /></span>
            <div>
              <b className="block text-xl font-bold leading-tight tracking-tight">
                {system?.containers_running ?? "–"}{" "}
                <small className="text-[13px] font-medium">of {system?.containers_total ?? "–"}</small>
              </b>
              <small className="text-xs text-ink-65">Containers running</small>
            </div>
          </div>
          <div className="tile flex items-center gap-3">
            <span className="stat-i text-teal"><MemoryStick aria-hidden /></span>
            <div>
              <b className="block text-xl font-bold leading-tight tracking-tight">
                {memUsedGb.toFixed(1)} <small className="text-[13px] font-medium">GB</small>
              </b>
              <small className="text-xs text-ink-65">Memory in use</small>
            </div>
          </div>
          <div className="tile flex items-center gap-3">
            <span className="stat-i text-amber"><HardDrive aria-hidden /></span>
            <div>
              <b className="block text-xl font-bold leading-tight tracking-tight">
                {system?.disk_usage.total_gb ?? "–"} <small className="text-[13px] font-medium">GB</small>
              </b>
              <small className="text-xs text-ink-65">Docker disk</small>
            </div>
          </div>
        </div>

        <div className="tile">
          <div className="mb-3.5 flex items-center justify-between">
            <h2 className="!text-base">Health</h2>
            <span className="text-xs text-ink-65">{groups.length} apps</span>
          </div>
          <div className="flex flex-col items-center gap-[18px] sm:flex-row">
            <HealthRing healthy={healthy} degraded={degraded} total={groups.length} />
            <div className="grid w-full flex-1 gap-3 text-xs text-ink-65">
              {[
                ["#14b8a6", "Healthy", healthy],
                ["#d97706", "Degraded", degraded],
                ["var(--ink-45)", "Stopped", stopped],
              ].map(([c, label, n]) => (
                <div key={label as string} className="flex items-baseline justify-between">
                  <span>
                    <span className="mr-1.5 inline-block h-[7px] w-[7px] rounded-full" style={{ background: c as string }} />
                    {label}
                    <b className="block text-[17px] text-ink">{n}</b>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <div className="tile">
          <div className="mb-3.5 flex items-center justify-between">
            <h2 className="!text-base">Apps</h2>
            <span className="text-xs text-ink-65">grouped by compose project</span>
          </div>
          {loading && groups.length === 0 && (
            <div className="grid gap-3">
              {[1, 2, 3].map((i) => <div key={i} className="skeleton h-12" />)}
            </div>
          )}
          {!loading && groups.length === 0 && !error && (
            <p className="py-10 text-center text-sm text-ink-65">
              No containers found. Start some Docker containers to see them here.
            </p>
          )}
          <div>
            {groups.map((group) => (
              <AppCard key={group.app.id} group={group} />
            ))}
          </div>
        </div>

        <div className="tile">
          <div className="mb-3.5 flex items-center justify-between">
            <h2 className="!text-base">Memory by app</h2>
            <span className="text-xs text-ink-65">of limit</span>
          </div>
          {byMem.length === 0 && <p className="text-sm text-ink-65">Nothing running.</p>}
          {byMem.map((g) => {
            const lim = memLimitOf(g);
            const pct = lim > 0 ? Math.min((memOf(g) / lim) * 100, 100) : 0;
            const color = pct > 90 ? "var(--red)" : pct > 70 ? "var(--amber)" : "var(--accent)";
            return (
              <div key={g.app.id} className="flex items-center gap-2 border-t border-line-2 py-2.5 text-[13px] first:border-t-0 first:pt-0">
                <span className="w-24 shrink-0 truncate" title={g.app.name}>{g.app.name}</span>
                <i className="hbar mx-1.5"><b style={{ width: `${pct}%`, background: color }} /></i>
                <b className="tabular-nums">{fmtMb(memOf(g))}</b>
              </div>
            );
          })}
          {dbs.length > 0 && (
            <>
              <h2 className="!text-base mt-[18px] mb-2.5">Databases</h2>
              {dbs.map((db) => (
                <div key={db.name} className="flex items-center gap-2 border-t border-line-2 py-2.5 text-[13px] first:border-t-0 first:pt-0">
                  <span className="w-24 shrink-0 truncate font-mono text-xs" title={db.name}>{db.name}</span>
                  <i className="hbar mx-1.5"><b style={{ width: `${(db.size_mb / maxDb) * 100}%`, background: "var(--teal)" }} /></i>
                  <b className="tabular-nums">{fmtMb(db.size_mb)}</b>
                </div>
              ))}
            </>
          )}
        </div>
      </div>

      <div className="tile mt-4">
        <div className="mb-3.5 flex items-center justify-between">
          <h2 className="!text-base">Recent actions</h2>
          <Link href="/deploys" className="text-xs font-semibold text-accent">Deploy log</Link>
        </div>
        {actions.length === 0 ? (
          <p className="text-sm text-ink-65">No restarts or pulls yet.</p>
        ) : (
          <div className="grid grid-cols-[auto_1fr] items-center gap-x-3.5 gap-y-2 text-[13px] sm:grid-cols-[auto_1fr_auto]">
            {actions.map((a) => (
              <div key={a.id} className="contents">
                <span className={`pill ${ACTION_PILL[a.status] ?? "p-off"} capitalize`}>{a.action.toLowerCase()}</span>
                <span className="min-w-0 truncate">
                  <span className="font-mono">{a.containerName}</span> · {a.status.toLowerCase()}
                </span>
                <span className="hidden font-mono text-xs text-ink-65 sm:inline">
                  {fmtTime(a.startedAt)} · {a.triggeredBy}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {problem && problemContainer && (
        <div className="cta mt-4">
          <div className="relative z-[1]">
            <h3>{problem.app.name} is degraded</h3>
            <p>
              {problem.containers.filter((c) => c.status === "running").length} of{" "}
              {problem.containers.length} containers running. Check the logs before you restart it.
            </p>
          </div>
          <button type="button" className="btn" onClick={() => setLogsFor(problemContainer.name)}>
            Open logs
          </button>
        </div>
      )}

      {logsFor && <ContainerDetail name={logsFor} onClose={() => setLogsFor(null)} />}
    </>
  );
}
