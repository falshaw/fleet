"use client";

import { useSession } from "next-auth/react";
import { useState, useEffect, useCallback } from "react";
import {
  Rocket,
  RefreshCw,
  Play,
  RotateCcw,
  Download,
} from "lucide-react";

interface DeployActionRecord {
  id: string;
  containerName: string;
  action: string;
  status: string;
  output: string | null;
  triggeredBy: string;
  startedAt: string;
  completedAt: string | null;
}

export default function DeploysPage() {
  const { data: session } = useSession();
  const [history, setHistory] = useState<DeployActionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{
    container: string;
    action: "restart" | "rebuild" | "pull";
  } | null>(null);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch("/api/deploy/history?limit=50");
      if (res.ok) {
        const data = await res.json();
        setHistory(data.actions || []);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (session?.user) fetchHistory();
  }, [session, fetchHistory]);

  const executeAction = async (
    container: string,
    action: "restart" | "rebuild" | "pull",
  ) => {
    setActionInProgress(`${container}:${action}`);
    setConfirmAction(null);
    try {
      const res = await fetch(
        `/api/deploy/${encodeURIComponent(container)}/${action}`,
        {
          method: "POST",
        },
      );
      await fetchHistory();
      if (!res.ok) {
        const data = await res.json();
        alert(`Action failed: ${data.error || "Unknown error"}`);
      }
    } catch (error) {
      alert(
        `Action failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    } finally {
      setActionInProgress(null);
    }
  };

  if (!session?.user) return null;

  return (
    <div className="mx-auto w-full max-w-6xl">

      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center logo-tile">
            <Rocket className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Deploy Actions</h1>
            <p className="text-xs text-ink-45">
              Restart, rebuild, or pull containers
            </p>
          </div>
        </div>

        <button
          onClick={fetchHistory}
          className="btn-secondary !py-1.5 !px-3 flex items-center gap-1.5 text-xs"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {/* Quick Action Panel */}
      <div className="card-luxury mb-8">
        <h2 className="text-sm font-bold uppercase tracking-wider text-ink-45 mb-4">
          Quick Actions
        </h2>
        <p className="text-sm text-ink-65">
          Type a container name, then pick an action. Every action is logged
          below.
        </p>
        <QuickActionForm
          actionInProgress={actionInProgress}
          onAction={(container, action) =>
            setConfirmAction({ container, action })
          }
        />
      </div>

      {/* Confirmation Modal */}
      {confirmAction && (
        <div className="fixed inset-0 bg-dark/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="card-luxury max-w-md w-full">
            <h3 className="text-lg font-bold mb-2">Confirm Action</h3>
            <p className="text-sm text-ink-65 mb-6">
              Are you sure you want to{" "}
              <strong className="text-accent">{confirmAction.action}</strong>{" "}
              container{" "}
              <code className="text-ink">{confirmAction.container}</code>?
            </p>
            <div className="flex items-center gap-3 justify-end">
              <button
                onClick={() => setConfirmAction(null)}
                className="btn-secondary !py-2 !px-4"
              >
                Cancel
              </button>
              <button
                onClick={() =>
                  executeAction(confirmAction.container, confirmAction.action)
                }
                className="btn btn-primary"
              >
                Confirm {confirmAction.action}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Deploy History */}
      <div className="card-luxury">
        <h2 className="text-sm font-bold uppercase tracking-wider text-ink-45 mb-4">
          Deploy History
        </h2>

        {loading && (
          <div className="text-center py-8">
            <RefreshCw className="w-5 h-5 animate-spin text-accent mx-auto" />
          </div>
        )}

        {!loading && history.length === 0 && (
          <p className="text-sm text-ink-45 text-center py-8">
            No deploy actions yet.
          </p>
        )}

        {!loading && history.length > 0 && (
          <div className="space-y-2">
            {history.map((action) => (
              <div key={action.id} className="card !bg-g-bg2 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                  <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-3">
                    <span
                      className={`badge text-[10px] ${
                        action.status === "SUCCESS"
                          ? "bg-teal-soft text-teal border-teal/30"
                          : action.status === "FAILED"
                            ? "bg-red-soft text-red border-red/30"
                            : "bg-amber-soft text-amber border-amber/30"
                      }`}
                    >
                      {action.status}
                    </span>
                    <span className="badge bg-g-bg2 text-ink-65 border-line text-[10px]">
                      {action.action}
                    </span>
                    <span className="font-mono text-sm text-ink-65 break-all">
                      {action.containerName}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-45">
                    <span>{action.triggeredBy}</span>
                    <span>{new Date(action.startedAt).toLocaleString()}</span>
                  </div>
                </div>
                {action.output && (
                  <pre className="text-xs text-[#d6deec] mt-2 max-h-20 overflow-auto font-mono bg-dark rounded p-2">
                    {action.output}
                  </pre>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function QuickActionForm({
  actionInProgress,
  onAction,
}: {
  actionInProgress: string | null;
  onAction: (container: string, action: "restart" | "rebuild" | "pull") => void;
}) {
  const [container, setContainer] = useState("");

  return (
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <input
        type="text"
        placeholder="Container name (e.g. shop-web)"
        value={container}
        onChange={(e) => setContainer(e.target.value)}
        className="min-w-0 flex-[1_1_100%] sm:flex-1"
      />
      <button
        onClick={() => container && onAction(container, "restart")}
        disabled={!container || !!actionInProgress}
        className="btn-secondary !py-2.5 !px-4 flex items-center gap-1.5 text-xs whitespace-nowrap"
      >
        <Play
          className={`w-3.5 h-3.5 ${actionInProgress?.includes("restart") ? "animate-spin" : ""}`}
        />
        Restart
      </button>
      <button
        onClick={() => container && onAction(container, "rebuild")}
        disabled={!container || !!actionInProgress}
        className="btn-secondary !py-2.5 !px-4 flex items-center gap-1.5 text-xs whitespace-nowrap"
      >
        <RotateCcw
          className={`w-3.5 h-3.5 ${actionInProgress?.includes("rebuild") ? "animate-spin" : ""}`}
        />
        Rebuild
      </button>
      <button
        onClick={() => container && onAction(container, "pull")}
        disabled={!container || !!actionInProgress}
        className="btn-secondary !py-2.5 !px-4 flex items-center gap-1.5 text-xs whitespace-nowrap"
      >
        <Download
          className={`w-3.5 h-3.5 ${actionInProgress?.includes("pull") ? "animate-spin" : ""}`}
        />
        Pull
      </button>
    </div>
  );
}
