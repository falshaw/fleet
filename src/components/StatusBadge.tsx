"use client";

const STATUS: Record<string, { pill: string; label: string }> = {
  healthy: { pill: "p-ok", label: "Healthy" },
  running: { pill: "p-ok", label: "Running" },
  degraded: { pill: "p-flag", label: "Degraded" },
  unhealthy: { pill: "p-risk", label: "Unhealthy" },
  restarting: { pill: "p-flag", label: "Restarting" },
  // "down" = no container in the group is running, i.e. the stack is stopped.
  down: { pill: "p-off", label: "Stopped" },
  exited: { pill: "p-off", label: "Exited" },
  stopped: { pill: "p-off", label: "Stopped" },
};

export function StatusBadge({
  status,
  size = "sm",
}: {
  status: string;
  size?: "sm" | "lg";
}) {
  const s = STATUS[status] ?? STATUS.stopped;
  return (
    <span className={`pill ${s.pill} ${size === "sm" ? "!h-6 !px-2.5 !text-[11px]" : ""}`}>
      {s.label}
    </span>
  );
}
