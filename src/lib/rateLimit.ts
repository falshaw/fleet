/**
 * fleet - Fleet Dashboard
 * Copyright (c) 2024-2026 Nick Falshaw
 */

// ABOUTME: In-memory rate limiting for API endpoints
// ABOUTME: P0 Security: Prevents brute force and abuse attacks

import { NextResponse } from "next/server";

type RequestLike = { headers: { get(name: string): string | null } };

export interface RateLimitConfig {
  interval: number;
  limit: number;
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();
const CLEANUP_INTERVAL = 60000;
let lastCleanup = Date.now();

function cleanupExpiredEntries() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetAt < now) rateLimitStore.delete(key);
  }
}

function getClientId(req: RequestLike): string {
  if (process.env.TRUST_PROXY === "true") {
    const forwarded = req.headers.get("x-forwarded-for");
    if (forwarded) {
      const ips = forwarded.split(",").map((ip) => ip.trim());
      return ips[ips.length - 1] || "unknown";
    }
    const realIp = req.headers.get("x-real-ip");
    if (realIp) return realIp;
  }

  const ua = req.headers.get("user-agent") || "unknown";
  return `ua-${ua.slice(0, 50)}`;
}

export function checkRateLimit(
  req: RequestLike,
  config: RateLimitConfig,
  prefix: string = "global",
): { limited: boolean; remaining: number; resetAt: number } {
  cleanupExpiredEntries();
  const clientId = getClientId(req);
  const key = `${prefix}:${clientId}`;
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  if (!entry || entry.resetAt < now) {
    const newEntry: RateLimitEntry = {
      count: 1,
      resetAt: now + config.interval,
    };
    rateLimitStore.set(key, newEntry);
    return {
      limited: false,
      remaining: config.limit - 1,
      resetAt: newEntry.resetAt,
    };
  }

  entry.count++;
  if (entry.count > config.limit) {
    return { limited: true, remaining: 0, resetAt: entry.resetAt };
  }
  return {
    limited: false,
    remaining: config.limit - entry.count,
    resetAt: entry.resetAt,
  };
}

export function rateLimitResponse(
  remaining: number,
  resetAt: number,
): NextResponse {
  const retryAfter = Math.ceil((resetAt - Date.now()) / 1000);
  return NextResponse.json(
    { error: "Too Many Requests", message: "Rate limit exceeded.", retryAfter },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfter),
        "X-RateLimit-Remaining": String(remaining),
        "X-RateLimit-Reset": String(Math.ceil(resetAt / 1000)),
      },
    },
  );
}

export function applyRateLimit(
  req: RequestLike,
  config: RateLimitConfig = RATE_LIMITS.api,
  prefix: string = "api",
): NextResponse | null {
  const { limited, remaining, resetAt } = checkRateLimit(req, config, prefix);
  if (limited) return rateLimitResponse(remaining, resetAt);
  return null;
}

export const RATE_LIMITS = {
  auth: { interval: 60 * 1000, limit: 10 },
  api: { interval: 60 * 1000, limit: 100 },
};
