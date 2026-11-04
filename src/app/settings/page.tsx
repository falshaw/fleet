"use client";

import { useSession } from "next-auth/react";
import { useState, useEffect, useCallback } from "react";
import { Bell, Send, Save } from "lucide-react";

const ALERT_TYPES = [
  { id: "CONTAINER_DOWN", label: "Container Down (exited or dead)" },
  { id: "HEALTH_CHECK_FAIL", label: "Health Check Failed" },
  { id: "HIGH_CPU", label: "High CPU (>90%)" },
  { id: "HIGH_MEMORY", label: "High Memory (>85% of limit)" },
];

export default function SettingsPage() {
  const { data: session } = useSession();
  const [config, setConfig] = useState({
    enabled: false,
    telegramBotToken: "",
    telegramChatId: "",
    alertTypes: [] as string[],
    cooldownMinutes: 15,
    hasToken: false,
  });
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const fetchConfig = useCallback(async () => {
    const res = await fetch("/api/alerts/config");
    if (res.ok) {
      const data = await res.json();
      setConfig({ ...data, telegramBotToken: "" });
    }
  }, []);

  useEffect(() => {
    if (session?.user) fetchConfig();
  }, [session, fetchConfig]);

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const body: Record<string, unknown> = {
        enabled: config.enabled,
        telegramChatId: config.telegramChatId,
        alertTypes: config.alertTypes,
        cooldownMinutes: config.cooldownMinutes,
      };
      if (config.telegramBotToken) {
        body.telegramBotToken = config.telegramBotToken;
      }

      const res = await fetch("/api/alerts/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const data = await res.json();
        setConfig({ ...data, telegramBotToken: "" });
        setMessage({ type: "success", text: "Configuration saved" });
      } else {
        setMessage({ type: "error", text: "Failed to save configuration" });
      }
    } catch {
      setMessage({ type: "error", text: "Network error" });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setMessage(null);
    try {
      const res = await fetch("/api/alerts/test", { method: "POST" });
      if (res.ok) {
        setMessage({ type: "success", text: "Test message sent to Telegram" });
      } else {
        const data = await res.json();
        setMessage({ type: "error", text: data.error || "Test failed" });
      }
    } catch {
      setMessage({ type: "error", text: "Network error" });
    } finally {
      setTesting(false);
    }
  };

  const toggleAlertType = (typeId: string) => {
    setConfig((prev) => ({
      ...prev,
      alertTypes: prev.alertTypes.includes(typeId)
        ? prev.alertTypes.filter((t) => t !== typeId)
        : [...prev.alertTypes, typeId],
    }));
  };

  if (!session?.user) return null;

  return (
    <div className="mx-auto w-full max-w-6xl">

      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center logo-tile">
          <Bell className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight">Alert Settings</h1>
          <p className="text-xs text-ink-45">
            Configure Telegram notifications for fleet events
          </p>
        </div>
      </div>

      {message && (
        <div
          className={`card-luxury mb-6 !py-3 ${message.type === "error" ? "!border-red/30" : "!border-teal/30"}`}
        >
          <p
            className={`text-sm ${message.type === "error" ? "text-red" : "text-teal"}`}
          >
            {message.text}
          </p>
        </div>
      )}

      <div className="card-luxury space-y-6">
        {/* Enable toggle */}
        <label className="flex items-center justify-between">
          <span className="text-sm font-semibold">Enable Telegram Alerts</span>
          <input
            type="checkbox"
            checked={config.enabled}
            onChange={(e) =>
              setConfig({ ...config, enabled: e.target.checked })
            }
            className="!w-auto accent-[var(--accent)]"
          />
        </label>

        {/* Bot Token */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-ink-45 mb-2">
            Telegram Bot Token{" "}
            {config.hasToken && (
              <span className="text-teal">(configured)</span>
            )}
          </label>
          <input
            type="password"
            placeholder={
              config.hasToken
                ? "Leave blank to keep current token"
                : "Enter bot token from @BotFather"
            }
            value={config.telegramBotToken}
            onChange={(e) =>
              setConfig({ ...config, telegramBotToken: e.target.value })
            }
          />
        </div>

        {/* Chat ID */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-ink-45 mb-2">
            Telegram Chat ID
          </label>
          <input
            type="text"
            placeholder="e.g. -1001234567890"
            value={config.telegramChatId}
            onChange={(e) =>
              setConfig({ ...config, telegramChatId: e.target.value })
            }
          />
        </div>

        {/* Cooldown */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-ink-45 mb-2">
            Cooldown (minutes)
          </label>
          <input
            type="number"
            min={1}
            max={1440}
            value={config.cooldownMinutes}
            onChange={(e) =>
              setConfig({
                ...config,
                cooldownMinutes: parseInt(e.target.value) || 15,
              })
            }
          />
          <p className="text-xs text-ink-45 mt-1">
            Minimum interval between alerts for the same container and type
          </p>
        </div>

        {/* Alert Types */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-ink-45 mb-3">
            Alert Types
          </label>
          <div className="grid grid-cols-2 gap-2">
            {ALERT_TYPES.map((type) => (
              <label
                key={type.id}
                className={`flex items-center gap-2 p-3 rounded-xl border cursor-pointer transition-all ${
                  config.alertTypes.includes(type.id)
                    ? "border-accent/40 bg-accent/5"
                    : "border-line-2 hover:border-line"
                }`}
              >
                <input
                  type="checkbox"
                  checked={config.alertTypes.includes(type.id)}
                  onChange={() => toggleAlertType(type.id)}
                  className="!w-auto accent-[var(--accent)]"
                />
                <span className="text-sm">{type.label}</span>
              </label>
            ))}
          </div>
          <p className="text-xs text-ink-45 mt-2">
            Leave all unchecked to receive all alert types
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 pt-4 border-t border-line-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn btn-primary"
          >
            <Save className="w-4 h-4" />
            {saving ? "Saving..." : "Save Configuration"}
          </button>
          <button
            onClick={handleTest}
            disabled={testing || !config.hasToken}
            className="btn-secondary flex items-center gap-2"
          >
            <Send className="w-4 h-4" />
            {testing ? "Sending..." : "Send Test"}
          </button>
        </div>
      </div>

      {/* Alert History */}
      <AlertHistory />
    </div>
  );
}

function AlertHistory() {
  const [alerts, setAlerts] = useState<
    {
      id: string;
      type: string;
      containerName: string;
      message: string;
      sentAt: string;
    }[]
  >([]);

  useEffect(() => {
    fetch("/api/alerts/history?limit=20")
      .then((r) => r.json())
      .then((data) => setAlerts(data.alerts || []))
      .catch((e) => console.error("Alert history fetch failed:", e));
  }, []);

  if (alerts.length === 0) return null;

  return (
    <div className="mt-8">
      <h2 className="text-sm font-bold uppercase tracking-wider text-ink-45 mb-4">
        Recent Alerts
      </h2>
      <div className="space-y-2">
        {alerts.map((alert) => (
          <div key={alert.id} className="card !bg-g-bg2 px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="badge bg-red-soft text-red border-red/30 text-[10px]">
                  {alert.type}
                </span>
                <span className="font-mono text-sm text-ink-65">
                  {alert.containerName}
                </span>
              </div>
              <span className="text-xs text-ink-45">
                {new Date(alert.sentAt).toLocaleString()}
              </span>
            </div>
            <p className="text-xs text-ink-65 mt-1">{alert.message}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
