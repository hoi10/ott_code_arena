require("dotenv").config();

const { PrismaClient } = require("@prisma/client");
const { PrismaMariaDb } = require("@prisma/adapter-mariadb");

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is not configured");
}

const adapter = new PrismaMariaDb(databaseUrl);

const prisma = new PrismaClient({
  adapter,
});

module.exports = prisma;