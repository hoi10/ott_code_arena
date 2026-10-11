require("dotenv").config();

const requiredEnvVars = ["DATABASE_URL", "JWT_SECRET"];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    throw new Error(`Missing required environment variable: ${envVar}`);
  }
}

if (process.env.JWT_SECRET.length < 32) {
  throw new Error("JWT_SECRET must be at least 32 characters long");
}

const env = {
  NODE_ENV: process.env.NODE_ENV || "development",
  PORT: Number(process.env.PORT) || 3000,
  HOST: process.env.HOST || "0.0.0.0",
  DATABASE_URL: process.env.DATABASE_URL,
  JWT_SECRET: process.env.JWT_SECRET,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "1d",
};

if (!Number.isInteger(env.PORT) || env.PORT < 1 || env.PORT > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535");
}

module.exports = env;