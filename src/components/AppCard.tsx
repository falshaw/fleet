"use client";

import { Database, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import { StatusBadge } from "./StatusBadge";
import { ContainerDetail } from "./ContainerDetail";
import type { AppGroup } from "@/app/api/fleet/containers/route";

const ICON_GRADIENT: Record<AppGroup["status"], string> = {
  healthy: "linear-gradient(140deg,#2563eb,#60a5fa)",
  degraded: "linear-gradient(140deg,#d97706,#fcd34d)",
  down: "linear-gradient(140deg,#64748b,#cbd5e1)",
  stopped: "linear-gradient(140deg,#64748b,#cbd5e1)",
};

export function AppCard({ group }: { group: AppGroup }) {
  const [expanded, setExpanded] = useState(false);
  const [selectedContainer, setSelectedContainer] = useState<string | null>(null);

  const isRunning = group.status === "healthy" || group.status === "degraded";
  const totalCpu = group.containers.reduce((s, c) => s + (c.stats?.cpu_percent || 0), 0);
  const totalMem = group.containers.reduce((s, c) => s + (c.stats?.memory_usage_mb || 0), 0);
  const memLabel = totalMem >= 1024 ? `${(totalMem / 1024).toFixed(1)} GB` : `${totalMem.toFixed(0)} MB`;
  const names = group.containers
    .map((c) => c.name.replace(new RegExp(`^${group.app.id}[-_]`), ""))
    .join(", ");

  return (
    <div className="border-t border-line-2 first:border-t-0">
      <button
        type="button"
        className="flex w-full items-center gap-3.5 py-3 text-left"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
      >
        <span className="app-ic" style={{ background: ICON_GRADIENT[group.status] }} aria-hidden>
          {group.app.icon}
        </span>
        <span className="min-w-0 flex-1">
          <b className="block truncate font-mono text-[13px] font-medium">{group.app.name}</b>
          <small className="block truncate text-xs text-ink-65">
            {group.containers.length} container{group.containers.length !== 1 ? "s" : ""}
            {names && ` · ${names}`}
            {group.app.port ? ` · :${group.app.port}` : ""}
          </small>
        </span>
        <span className="flex shrink-0 items-center gap-3 text-xs text-ink-65">
          {isRunning && (
            <span className="hidden font-mono sm:inline">
              {totalCpu.toFixed(1)}% · {memLabel}
            </span>
          )}
          <StatusBadge status={group.status} />
          {expanded ? <ChevronUp className="h-4 w-4" aria-hidden /> : <ChevronDown className="h-4 w-4" aria-hidden />}
        </span>
      </button>

      {expanded && (
        <div className="mb-3 grid gap-2 pl-0 sm:pl-12">
          {group.dbSize && group.dbSize.length > 0 && (
            <div className="card flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-[13px]">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-65">
                <Database className="h-3.5 w-3.5 text-teal" aria-hidden /> Database
              </span>
              {group.dbSize.map((db) => (
                <span key={db.name}>
                  <span className="text-ink-65">{db.name}</span>{" "}
                  <b className="tabular-nums">{db.size_mb} MB</b>
                </span>
              ))}
            </div>
          )}
          {group.containers.map((container) => (
            <button
              type="button"
              key={container.id}
              className="card flex w-full flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2.5 text-left hover:border-accent"
              onClick={() => setSelectedContainer(container.name)}
              title="Open details and logs"
            >
              <span className="flex min-w-0 items-center gap-3">
                <StatusBadge status={container.status} />
                <span className="break-all font-mono text-[13px]">{container.name}</span>
              </span>
              <span className="flex items-center gap-4 text-xs text-ink-65">
                <span className="hidden font-mono lg:inline">{container.image}</span>
                {container.ports.length > 0 && (
                  <span className="hidden font-mono sm:inline">{container.ports[0]}</span>
                )}
                {container.stats && container.status === "running" && (
                  <span className="tabular-nums">
                    {container.stats.cpu_percent.toFixed(1)}% · {container.stats.memory_usage_mb.toFixed(0)} MB
                  </span>
                )}
              </span>
            </button>
          ))}
        </div>
      )}

      {selectedContainer && (
        <ContainerDetail name={selectedContainer} onClose={() => setSelectedContainer(null)} />
      )}
    </div>
  );
}
