import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock PrismaPg adapter — must use function (not arrow) so it can be called with `new`
vi.mock("@prisma/adapter-pg", () => ({
  PrismaPg: vi.fn().mockImplementation(function (
    this: Record<string, unknown>,
    opts: Record<string, unknown>,
  ) {
    this.connectionString = opts.connectionString;
    this.__type = "mock-adapter";
  }),
}));

vi.mock("@prisma/client", () => {
  const MockPrismaClient = vi.fn().mockImplementation(function (
    this: Record<string, unknown>,
  ) {
    this.$connect = vi.fn();
    this.$disconnect = vi.fn();
    this.$queryRaw = vi.fn();
  });
  return { PrismaClient: MockPrismaClient };
});

describe("fleet db - PrismaClient configuration", () => {
  beforeEach(() => {
    vi.resetModules();
    // DATABASE_URL is set in the test environment (.env.test or CI)
    if (!process.env.DATABASE_URL) {
      process.env.DATABASE_URL = "test-db-placeholder";
    }
  });

  it("should export a prisma instance", async () => {
    const { prisma } = await import("../../src/lib/prisma");
    expect(prisma).toBeDefined();
  });

  it("should create PrismaPg adapter with DATABASE_URL", async () => {
    const { PrismaPg } = await import("@prisma/adapter-pg");
    await import("../../src/lib/prisma");

    expect(PrismaPg).toHaveBeenCalledWith(
      expect.objectContaining({ connectionString: process.env.DATABASE_URL }),
    );
  });

  it("should create PrismaClient with adapter", async () => {
    const { PrismaClient } = await import("@prisma/client");
    await import("../../src/lib/prisma");

    expect(PrismaClient).toHaveBeenCalledWith(
      expect.objectContaining({
        adapter: expect.anything(),
      }),
    );
  });

  it("should cache prisma on globalThis in non-production", async () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = "development";
    const { prisma } = await import("../../src/lib/prisma");
    const global = globalThis as unknown as {
      prisma: typeof prisma | undefined;
    };
    expect(global.prisma).toBe(prisma);
  });
});
