require("dotenv").config();

const app = require("./app");
const roomScheduler = require("./services/room-scheduler");

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "0.0.0.0";

const server = app.listen(PORT, HOST, () => {
  console.log(`OTT Code Arena server running at http://localhost:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
  roomScheduler.resumeActiveRooms().catch((error) => {
    console.error("Không thể khôi phục các trận đấu trong phòng:", error);
  });
  roomScheduler.startCleanup();
});

async function shutdown(signal) {
  console.log(`${signal} received. Shutting down server...`);
  roomScheduler.stop();

  server.close(async () => {
    try {
      const prisma = require("./config/database");
      await prisma.$disconnect();
      console.log("Database disconnected.");
      process.exit(0);
    } catch (error) {
      console.error("Error during shutdown:", error);
      process.exit(1);
    }
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

module.exports = server;