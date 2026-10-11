require("dotenv").config();

const prisma = require("./src/config/database");

async function main() {
  await prisma.$connect();
  console.log("Connected to MySQL successfully!");

  await prisma.$disconnect();
}

main()
  .catch((error) => {
    console.error("Database connection failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });