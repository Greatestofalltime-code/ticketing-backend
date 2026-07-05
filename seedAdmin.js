require("dotenv").config();
const bcrypt = require("bcryptjs");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  const hashedPassword = await bcrypt.hash("admin123", 10);

  const admin = await prisma.user.upsert({
    where: { email: "admin@ticketing.com" },
    update: { role: "admin", password: hashedPassword },
    create: {
      name: "Admin User",
      email: "admin@ticketing.com",
      password: hashedPassword,
      role: "admin",
    },
  });

  console.log("Admin created:", admin.email, "| Role:", admin.role);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());