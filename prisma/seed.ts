import { Role, ThemePreference } from "@prisma/client";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("ChangeMeAdmin123!", 12);

  const admin = await prisma.user.upsert({
    where: { internalEmail: "admin@333mtrsprts.com" },
    update: {},
    create: {
      name: "Portal Admin",
      internalEmail: "admin@333mtrsprts.com",
      externalEmail: "admin.external@example.com",
      passwordHash,
      role: Role.ADMIN,
      department: "Operations",
      position: "Administrator",
      themePreference: ThemePreference.SYSTEM,
    },
  });

  const staffPass = await bcrypt.hash("ChangeMeStaff123!", 12);
  await prisma.user.upsert({
    where: { internalEmail: "cameron@333mtrsprts.com" },
    update: {},
    create: {
      name: "Cameron Example",
      internalEmail: "cameron@333mtrsprts.com",
      externalEmail: "cameronanthev@gmail.com",
      passwordHash: staffPass,
      role: Role.STAFF,
      department: "Sales",
      position: "Account Manager",
    },
  });

  await prisma.knowledgeArticle.upsert({
    where: { slug: "welcome-to-the-portal" },
    update: {},
    create: {
      title: "Welcome to the 333 Motorsport staff portal",
      slug: "welcome-to-the-portal",
      excerpt: "How to get oriented on day one.",
      category: "Internal procedures",
      content:
        "Use Home for announcements, Knowledgebase for product notes, and Mail for internal-only messages between @333mtrsprts.com addresses.",
      authorId: admin.id,
    },
  });

  const launch = await prisma.post.findFirst({
    where: { title: "Portal launch" },
  });
  if (!launch) {
    await prisma.post.create({
      data: {
        title: "Portal launch",
        content:
          "This is your internal hub for news, documentation, and lightweight messaging. Pinned posts notify the team automatically.",
        pinned: true,
        authorId: admin.id,
      },
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
