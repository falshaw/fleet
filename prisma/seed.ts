import crypto from "crypto";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Starting seed...");

  const adminPassword =
    process.env.SEED_ADMIN_PASSWORD ||
    crypto.randomBytes(16).toString("base64url");
  const hashedPassword = await bcrypt.hash(adminPassword, 12);

  console.log("\n========================================");
  console.log("Admin user credentials:");
  console.log("  Email:    admin@fleet.local");
  console.log(`  Password: ${adminPassword}`);
  console.log("========================================\n");

  const admin = await prisma.user.upsert({
    where: { email: "admin@fleet.local" },
    update: {
      passwordHash: hashedPassword,
      role: "ADMIN",
      isActive: true,
    },
    create: {
      email: "admin@fleet.local",
      passwordHash: hashedPassword,
      name: "Fleet Admin",
      role: "ADMIN",
      isActive: true,
    },
  });

  console.log("Admin user created:", admin.email);
  console.log("\nSeed completed successfully!");
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
