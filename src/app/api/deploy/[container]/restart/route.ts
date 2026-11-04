import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

// Docker container names: alphanumeric start, then [a-zA-Z0-9_.-]
const ContainerSchema = z
  .string()
  .min(1)
  .max(255)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/);

const PROTECTED_CONTAINERS = ["postgres", "redis", "pg", "db"];

function isProtected(name: string): boolean {
  return PROTECTED_CONTAINERS.some((p) => name.toLowerCase().includes(p));
}

// POST /api/deploy/[container]/restart - Restart a container
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ container: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { container: rawContainer } = await params;
  const parsed = ContainerSchema.safeParse(rawContainer);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const container = parsed.data;

  if (isProtected(container)) {
    return NextResponse.json(
      { error: "Cannot perform actions on database containers" },
      { status: 403 },
    );
  }

  const action = await prisma.deployAction.create({
    data: {
      containerName: container,
      action: "RESTART",
      status: "RUNNING",
      triggeredBy: session.user.email || session.user.id,
    },
  });

  try {
    const AGENT_URL = process.env.FLEET_AGENT_URL || "http://fleet-agent:5050";
    const AGENT_SECRET = process.env.FLEET_AGENT_SECRET || "";

    const res = await fetch(
      `${AGENT_URL}/api/containers/${encodeURIComponent(container)}/restart`,
      {
        method: "POST",
        headers: AGENT_SECRET ? { "X-Fleet-Secret": AGENT_SECRET } : {},
        signal: AbortSignal.timeout(60000),
      },
    );

    const output = await res.text();

    await prisma.deployAction.update({
      where: { id: action.id },
      data: {
        status: res.ok ? "SUCCESS" : "FAILED",
        output: output.slice(0, 4000),
        completedAt: new Date(),
      },
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: "Restart failed", output },
        { status: 502 },
      );
    }

    logger.info("Container restarted", { container, user: session.user.email });

    return NextResponse.json({
      success: true,
      actionId: action.id,
      container,
      action: "RESTART",
    });
  } catch (error) {
    await prisma.deployAction.update({
      where: { id: action.id },
      data: {
        status: "FAILED",
        output: error instanceof Error ? error.message : "Unknown error",
        completedAt: new Date(),
      },
    });

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Restart failed" },
      { status: 502 },
    );
  }
}
