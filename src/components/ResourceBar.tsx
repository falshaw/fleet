"use client";

interface ResourceBarProps {
  label: string;
  value: number;
  max: number;
  unit: string;
  color?: string;
}

export function ResourceBar({
  label,
  value,
  max,
  unit,
  color = "var(--accent)",
}: ResourceBarProps) {
  const percent = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  const barColor = percent > 90 ? "var(--red)" : percent > 70 ? "var(--amber)" : color;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-ink-65">{label}</span>
        <span className="font-semibold tabular-nums">
          {value.toFixed(1)}
          {unit}
          <span className="text-ink-45">
            {" "}
            / {max.toFixed(1)}
            {unit}
          </span>
        </span>
      </div>
      <div className="hbar !h-2">
        <b style={{ width: `${Math.max(percent, 1)}%`, background: barColor }} />
      </div>
    </div>
  );
}
