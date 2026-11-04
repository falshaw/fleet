"use client";

import { X, RefreshCw } from "lucide-react";
import { useState, useEffect, useCallback } from "react";

interface ContainerDetailProps {
  name: string;
  onClose: () => void;
}

export function ContainerDetail({ name, onClose }: ContainerDetailProps) {
  const [logs, setLogs] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [lines, setLines] = useState(50);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/fleet/logs/${encodeURIComponent(name)}?lines=${lines}`,
      );
      const data = await res.json();
      setLogs(data.logs || data.error || "No logs available");
    } catch {
      setLogs("Failed to fetch logs");
    } finally {
      setLoading(false);
    }
  }, [name, lines]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Close on escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-dark/50 backdrop-blur-sm">
      <div className="card-luxury w-full max-w-4xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold">{name}</h2>
            <p className="text-xs text-ink-45">Container Logs</p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={lines}
              onChange={(e) => setLines(Number(e.target.value))}
              className="!w-auto text-xs !py-1 !px-2"
            >
              <option value={20}>20 lines</option>
              <option value={50}>50 lines</option>
              <option value={100}>100 lines</option>
              <option value={200}>200 lines</option>
              <option value={500}>500 lines</option>
            </select>
            <button
              onClick={fetchLogs}
              className="btn-secondary !py-1.5 !px-3 flex items-center gap-1.5"
              disabled={loading}
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`}
              />
              Refresh
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-g-bg2 transition-colors"
            >
              <X className="w-5 h-5 text-ink-65" />
            </button>
          </div>
        </div>

        {/* Log output */}
        <div className="flex-1 overflow-auto rounded-lg bg-dark border border-line p-4">
          {loading ? (
            <div className="flex items-center gap-2 text-[#9aa6b8]">
              <RefreshCw className="w-4 h-4 animate-spin" />
              Loading logs...
            </div>
          ) : (
            <pre className="text-xs font-mono text-[#d6deec] whitespace-pre-wrap break-all leading-5">
              {logs}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
