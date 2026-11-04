import { handlers } from "@/lib/auth";
import { applyRateLimit, RATE_LIMITS } from "@/lib/rateLimit";
import { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  const result = await handlers.GET(req);
  return (
    result ?? Response.json({ error: "Auth not configured" }, { status: 500 })
  );
}

export async function POST(req: NextRequest) {
  const rateLimitResult = applyRateLimit(req, RATE_LIMITS.auth, "auth");
  if (rateLimitResult) return rateLimitResult;
  const result = await handlers.POST(req);
  return (
    result ?? Response.json({ error: "Auth not configured" }, { status: 500 })
  );
}
