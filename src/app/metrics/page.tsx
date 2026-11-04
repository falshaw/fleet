"use client";

import { useSession } from "next-auth/react";
import { useState, useEffect, useCallback } from "react";
import { BarChart3, RefreshCw } from "lucide-react";

interface ContainerSummary {
  name: string;
  avgCpu: number;
  avgMemoryMB: number;
  peakCpu: number;
  peakMemoryMB: number;
  dataPoints: number;
}

interface TimelinePoint {
  time: string;
  avgCpu: number;
  avgMemoryMB: number;
}

interface SummaryData {
  range: string;
  totalDataPoints: number;
  containerCount: number;
  fleet: {
    avgCpuPercent: number;
    avgMemoryMB: number;
    peakCpuPercent: number;
    peakMemoryMB: number;
  };
  containers: ContainerSummary[];
  timeline: TimelinePoint[];
}

export default function MetricsPage() {
  const { data: session } = useSession();
  const [range, setRange] = useState("24h");
  const [data, setData] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [collecting, setCollecting] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/metrics/summary?range=${range}`);
      if (res.ok) setData(await res.json());
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    if (session?.user) fetchData();
  }, [session, fetchData]);

  const handleCollect = async () => {
    setCollecting(true);
    try {
      await fetch("/api/metrics/collect", { method: "POST" });
      await fetchData();
    } catch {
      // silent
    } finally {
      setCollecting(false);
    }
  };

  if (!session?.user) return null;

  return (
    <div className="mx-auto w-full max-w-6xl">

      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center logo-tile">
            <BarChart3 className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">
              Historical Metrics
            </h1>
            <p className="text-xs text-ink-45">
              Container resource trends over time
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Range selector */}
          <div className="flex items-center gap-1 bg-g-bg2 rounded-lg p-1 border border-line-2">
            {["24h", "7d", "30d"].map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  range === r
                    ? "bg-accent/20 text-accent border border-accent/30"
                    : "text-ink-45 hover:text-ink-65"
                }`}
              >
                {r}
              </button>
            ))}
          </div>

          <button
            onClick={handleCollect}
            disabled={collecting}
            className="btn-secondary !py-1.5 !px-3 flex items-center gap-1.5 text-xs"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${collecting ? "animate-spin" : ""}`}
            />
            Collect Now
          </button>
        </div>
      </div>

      {loading && (
        <div className="card-luxury text-center py-16">
          <RefreshCw className="w-6 h-6 animate-spin text-accent mx-auto mb-2" />
          <p className="text-ink-45 text-sm">Loading metrics...</p>
        </div>
      )}

      {!loading && data && (
        <>
          {/* Fleet Summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <MetricBox
              label="Avg CPU"
              value={`${data.fleet.avgCpuPercent.toFixed(1)}%`}
            />
            <MetricBox
              label="Peak CPU"
              value={`${data.fleet.peakCpuPercent.toFixed(1)}%`}
            />
            <MetricBox
              label="Avg Memory"
              value={`${data.fleet.avgMemoryMB.toFixed(0)} MB`}
            />
            <MetricBox label="Containers" value={`${data.containerCount}`} />
          </div>

          {/* Timeline (simple ASCII-style bar chart) */}
          {data.timeline.length > 0 && (
            <div className="card-luxury mb-8">
              <h2 className="text-sm font-bold uppercase tracking-wider text-ink-45 mb-4">
                CPU Usage Over Time
              </h2>
              <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
                {(() => {
                  // Newest hour first; bars scaled to the busiest hour shown.
                  const points = data.timeline.slice(-48).reverse();
                  const peak = Math.max(...points.map((p) => p.avgCpu), 0.1);
                  return points.map((point) => {
                  const barWidth = Math.min(Math.max((point.avgCpu / peak) * 100, 0), 100);
                  const label = new Date(point.time).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                  });
                  return (
                    <div key={point.time} className="flex items-center gap-3">
                      <span className="text-[10px] text-ink-45 w-24 shrink-0 text-right font-mono">
                        {label}
                      </span>
                      <div className="flex-1 h-4 bg-g-bg2 rounded overflow-hidden">
                        <div
                          className="h-full rounded transition-all"
                          style={{
                            width: `${barWidth}%`,
                            background:
                              point.avgCpu > 80
                                ? "var(--red)"
                                : point.avgCpu > 50
                                  ? "var(--amber)"
                                  : "linear-gradient(90deg, #60a5fa, var(--accent))",
                          }}
                        />
                      </div>
                      <span className="text-xs text-ink-65 w-12 text-right tabular-nums">
                        {point.avgCpu.toFixed(1)}%
                      </span>
                    </div>
                  );
                  });
                })()}
              </div>
            </div>
          )}

          {/* Per-Container Table */}
          <div className="card-luxury">
            <h2 className="text-sm font-bold uppercase tracking-wider text-ink-45 mb-4">
              Per-Container Statistics ({range})
            </h2>
            {data.containers.length === 0 ? (
              <p className="text-sm text-ink-45 text-center py-8">
                No metrics collected yet. Click &quot;Collect Now&quot; to
                start.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line-2">
                      <th className="text-left py-2 text-xs font-semibold uppercase tracking-wider text-ink-45">
                        Container
                      </th>
                      <th className="text-right py-2 text-xs font-semibold uppercase tracking-wider text-ink-45">
                        Avg CPU
                      </th>
                      <th className="text-right py-2 text-xs font-semibold uppercase tracking-wider text-ink-45">
                        Peak CPU
                      </th>
                      <th className="text-right py-2 text-xs font-semibold uppercase tracking-wider text-ink-45">
                        Avg RAM
                      </th>
                      <th className="text-right py-2 text-xs font-semibold uppercase tracking-wider text-ink-45">
                        Peak RAM
                      </th>
                      <th className="text-right py-2 text-xs font-semibold uppercase tracking-wider text-ink-45">
                        Points
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.containers
                      .sort((a, b) => b.avgCpu - a.avgCpu)
                      .map((c) => (
                        <tr
                          key={c.name}
                          className="border-b border-line-2 hover:bg-g-bg2"
                        >
                          <td className="py-2.5 font-mono text-ink-65">
                            {c.name}
                          </td>
                          <td className="py-2.5 text-right tabular-nums text-ink-65">
                            {c.avgCpu.toFixed(1)}%
                          </td>
                          <td className="py-2.5 text-right tabular-nums text-ink-65">
                            {c.peakCpu.toFixed(1)}%
                          </td>
                          <td className="py-2.5 text-right tabular-nums text-ink-65">
                            {c.avgMemoryMB.toFixed(0)} MB
                          </td>
                          <td className="py-2.5 text-right tabular-nums text-ink-65">
                            {c.peakMemoryMB.toFixed(0)} MB
                          </td>
                          <td className="py-2.5 text-right tabular-nums text-ink-45">
                            {c.dataPoints}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {!loading && (!data || data.totalDataPoints === 0) && (
        <div className="card-luxury text-center py-16">
          <BarChart3 className="w-8 h-8 text-ink-45 mx-auto mb-3" />
          <p className="text-ink-45">No metrics data yet.</p>
          <p className="text-xs text-ink-45 mt-1">
            Click &quot;Collect Now&quot; or set up a cron to collect metrics
            periodically.
          </p>
        </div>
      )}
    </div>
  );
}

function MetricBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="card-luxury !p-4 text-center">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-45 mb-1">
        {label}
      </div>
      <div className="text-xl font-extrabold tabular-nums text-ink">
        {value}
      </div>
    </div>
  );
}
