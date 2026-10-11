const express = require("express");
const botController = require("../controllers/bot.controller");
const authMiddleware = require("../middlewares/auth.middleware");

const router = express.Router();

router.use(authMiddleware);

router.get("/public", botController.getPublicBots);
router.post("/test", botController.testBot);
router.get("/", botController.getMyBots);
router.get("/:id", botController.getBotById);
router.post("/", botController.createBot);
router.patch("/:id", botController.updateBot);
router.delete("/:id", botController.deleteBot);

module.exports = router;