import { prisma } from "./index";
import { hash } from "@/utils/hash";

const SEED_USERS = [
  {
    name: "Admin User",
    email: "admin@educore.app",
    password: "Admin@123",
    role: "admin" as const,
  },
  {
    name: "Teacher User",
    email: "teacher@educore.app",
    password: "Teacher@123",
    role: "teacher" as const,
  },
  {
    name: "Student User",
    email: "student@educore.app",
    password: "Student@123",
    role: "student" as const,
  },
];

async function seed() {
  for (const u of SEED_USERS) {
    const existing = await prisma.user.findUnique({
      where: { email: u.email },
    });
    if (existing) {
      console.log(`↻  ${u.email} already exists — skipping`);
      continue;
    }
    await prisma.user.create({
      data: {
        name: u.name,
        email: u.email,
        role: u.role,
        passwordHash: await hash(u.password),
        emailVerified: true,
      },
    });
    console.log(`✓  seeded ${u.role}: ${u.email} / ${u.password}`);
  }
  await prisma.$disconnect();
  process.exit(0);
}

seed().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
