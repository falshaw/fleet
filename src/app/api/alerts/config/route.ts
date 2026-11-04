import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { encrypt, isEncryptionConfigured } from "@/lib/crypto";

const ALERT_TYPES = [
  "CONTAINER_DOWN",
  "CONTAINER_RESTART",
  "HIGH_CPU",
  "HIGH_MEMORY",
  "HIGH_DISK",
  "HEALTH_CHECK_FAIL",
] as const;

const ConfigSchema = z.object({
  enabled: z.boolean().optional(),
  telegramBotToken: z.string().min(1).optional(),
  telegramChatId: z.string().optional(),
  alertTypes: z.array(z.enum(ALERT_TYPES)).optional(),
  cooldownMinutes: z.number().int().min(0).optional(),
});

// GET /api/alerts/config - Get alert configuration
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const configs = await prisma.alertConfig.findMany({ take: 1 });
  const config = configs[0];

  if (!config) {
    return NextResponse.json({
      enabled: false,
      telegramChatId: "",
      alertTypes: [],
      cooldownMinutes: 15,
      hasToken: false,
    });
  }

  return NextResponse.json({
    enabled: config.enabled,
    telegramChatId: config.telegramChatId || "",
    alertTypes: config.alertTypes,
    cooldownMinutes: config.cooldownMinutes,
    hasToken: !!config.telegramBotToken,
  });
}

// POST /api/alerts/config - Update alert configuration
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = ConfigSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const {
    enabled,
    telegramBotToken,
    telegramChatId,
    alertTypes,
    cooldownMinutes,
  } = parsed.data;

  const configs = await prisma.alertConfig.findMany({ take: 1 });
  const existing = configs[0];

  // Encrypt bot token before storing — refuse to persist plaintext secrets
  let tokenToStore = existing?.telegramBotToken ?? null;
  if (telegramBotToken) {
    if (!isEncryptionConfigured()) {
      return NextResponse.json(
        { error: "ENCRYPTION_KEY required to store bot token" },
        { status: 500 },
      );
    }
    tokenToStore = encrypt(telegramBotToken);
  }

  const data = {
    enabled: enabled ?? existing?.enabled ?? false,
    telegramBotToken: tokenToStore,
    telegramChatId: telegramChatId ?? existing?.telegramChatId ?? null,
    alertTypes: alertTypes ?? existing?.alertTypes ?? [],
    cooldownMinutes: cooldownMinutes ?? existing?.cooldownMinutes ?? 15,
  };

  let config;
  if (existing) {
    config = await prisma.alertConfig.update({
      where: { id: existing.id },
      data,
    });
  } else {
    config = await prisma.alertConfig.create({ data });
  }

  return NextResponse.json({
    success: true,
    enabled: config.enabled,
    telegramChatId: config.telegramChatId || "",
    alertTypes: config.alertTypes,
    cooldownMinutes: config.cooldownMinutes,
    hasToken: !!config.telegramBotToken,
  });
}
