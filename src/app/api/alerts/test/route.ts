import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendTestMessage } from "@/lib/telegram";
import { decrypt, isEncryptionConfigured } from "@/lib/crypto";

// POST /api/alerts/test - Send test Telegram message
export async function POST() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const configs = await prisma.alertConfig.findMany({ take: 1 });
  const config = configs[0];

  if (!config || !config.telegramBotToken || !config.telegramChatId) {
    return NextResponse.json(
      { error: "Telegram not configured. Set bot token and chat ID first." },
      { status: 400 },
    );
  }

  // Decrypt bot token if encryption is configured
  let botToken = config.telegramBotToken;
  if (isEncryptionConfigured()) {
    try {
      botToken = decrypt(config.telegramBotToken);
    } catch {
      return NextResponse.json(
        { error: "Failed to decrypt bot token. Check ENCRYPTION_KEY." },
        { status: 500 },
      );
    }
  }

  const sent = await sendTestMessage(botToken, config.telegramChatId);

  if (!sent) {
    return NextResponse.json(
      { error: "Failed to send test message. Check bot token and chat ID." },
      { status: 502 },
    );
  }

  return NextResponse.json({ success: true, message: "Test message sent" });
}
