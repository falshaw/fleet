// ABOUTME: Telegram Bot API client for fleet alerts
// ABOUTME: Sends messages to configured chat_id with cooldown tracking

import { prisma } from "./prisma";
import { logger } from "./logger";
import { decrypt, isEncryptionConfigured } from "./crypto";

interface TelegramConfig {
  botToken: string;
  chatId: string;
}

export type AlertType =
  | "CONTAINER_DOWN"
  | "CONTAINER_RESTART"
  | "HIGH_CPU"
  | "HIGH_MEMORY"
  | "HIGH_DISK"
  | "HEALTH_CHECK_FAIL";

const ALERT_LABELS: Record<AlertType, string> = {
  CONTAINER_DOWN: "Container Down",
  CONTAINER_RESTART: "Container Restart",
  HIGH_CPU: "High CPU (>90%)",
  HIGH_MEMORY: "High Memory (>85%)",
  HIGH_DISK: "High Disk (>90%)",
  HEALTH_CHECK_FAIL: "Health Check Failed",
};

// In-memory cooldown tracker
const cooldowns = new Map<string, number>();

function getCooldownKey(type: string, containerName: string): string {
  return `${type}:${containerName}`;
}

function isInCooldown(
  type: string,
  containerName: string,
  cooldownMinutes: number,
): boolean {
  const key = getCooldownKey(type, containerName);
  const lastSent = cooldowns.get(key);
  if (!lastSent) return false;
  return Date.now() - lastSent < cooldownMinutes * 60 * 1000;
}

function setCooldown(type: string, containerName: string): void {
  cooldowns.set(getCooldownKey(type, containerName), Date.now());
}

export async function sendTelegramMessage(
  config: TelegramConfig,
  text: string,
): Promise<boolean> {
  try {
    const url = `https://api.telegram.org/bot${config.botToken}/sendMessage`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: config.chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      logger.error("Telegram API error", {
        status: response.status,
        body: errorBody,
      });
      return false;
    }

    return true;
  } catch (error) {
    logger.error("Telegram send failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

export async function sendAlert(
  type: AlertType,
  containerName: string,
  details: string,
): Promise<boolean> {
  // Get config from database
  const configs = await prisma.alertConfig.findMany({ take: 1 });
  const config = configs[0];

  if (
    !config ||
    !config.enabled ||
    !config.telegramBotToken ||
    !config.telegramChatId
  ) {
    return false;
  }

  // Check if this alert type is enabled
  const enabledTypes = config.alertTypes as string[];
  if (enabledTypes.length > 0 && !enabledTypes.includes(type)) {
    return false;
  }

  // Check cooldown
  if (isInCooldown(type, containerName, config.cooldownMinutes)) {
    return false;
  }

  // Decrypt bot token if encryption is configured
  let botToken = config.telegramBotToken;
  if (isEncryptionConfigured()) {
    try {
      botToken = decrypt(config.telegramBotToken);
    } catch (err) {
      logger.error("Failed to decrypt Telegram bot token", {
        error: err instanceof Error ? err.message : String(err),
      });
      return false;
    }
  }

  const emoji =
    type.includes("DOWN") || type.includes("FAIL")
      ? "\u26a0\ufe0f"
      : type.includes("HIGH")
        ? "\u26a1"
        : "\u2139\ufe0f";

  const message = [
    `${emoji} <b>Fleet Alert</b>`,
    "",
    `<b>Type:</b> ${ALERT_LABELS[type]}`,
    `<b>Container:</b> <code>${containerName}</code>`,
    `<b>Details:</b> ${details}`,
    "",
    `<i>${new Date().toISOString()}</i>`,
  ].join("\n");

  const sent = await sendTelegramMessage(
    { botToken, chatId: config.telegramChatId },
    message,
  );

  if (sent) {
    setCooldown(type, containerName);

    // Log the alert
    await prisma.alertLog.create({
      data: {
        type,
        containerName,
        message: `${ALERT_LABELS[type]}: ${details}`,
      },
    });
  }

  return sent;
}

export async function sendTestMessage(
  botToken: string,
  chatId: string,
): Promise<boolean> {
  return sendTelegramMessage(
    { botToken, chatId },
    "\u2705 <b>Fleet</b>\n\nTelegram alert connection test successful.",
  );
}
