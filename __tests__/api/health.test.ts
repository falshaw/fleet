import { describe, it, expect, vi, beforeEach } from "vitest";

// Use vi.hoisted so the mock fn is available when vi.mock factory runs
const { mockQueryRaw } = vi.hoisted(() => ({
  mockQueryRaw: vi.fn(),
}));

// Mock Prisma — the route imports from "@/lib/prisma"
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $queryRaw: mockQueryRaw,
  },
}));

import { GET } from "../../src/app/api/health/route";

describe("fleet health API - GET /api/health", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return healthy status when database is reachable", async () => {
    mockQueryRaw.mockResolvedValue([{ "?column?": 1 }]);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("healthy");
    expect(body.service).toBe("fleet");
    expect(body.version).toBe("1.0.0");
    expect(body.timestamp).toBeDefined();
  });

  it("should return unhealthy status when database is unreachable", async () => {
    mockQueryRaw.mockRejectedValue(new Error("Connection refused"));

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.status).toBe("unhealthy");
    expect(body.service).toBe("fleet");
    expect(body.error).toBe("Connection refused");
    expect(body.timestamp).toBeDefined();
  });

  it("should handle non-Error exceptions gracefully", async () => {
    mockQueryRaw.mockRejectedValue("string error");

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.status).toBe("unhealthy");
    expect(body.error).toBe("Unknown error");
  });

  it("should include a valid ISO timestamp", async () => {
    mockQueryRaw.mockResolvedValue([{ "?column?": 1 }]);

    const response = await GET();
    const body = await response.json();

    const parsed = new Date(body.timestamp);
    expect(parsed.getTime()).not.toBeNaN();
  });
});
