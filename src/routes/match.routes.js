const express = require("express");
const matchController = require("../controllers/match.controller");
const authMiddleware = require("../middlewares/auth.middleware");

const router = express.Router();

router.use(authMiddleware);

router.get("/", matchController.getMatches);
router.get("/:id", matchController.getMatchById);
router.post("/", matchController.createMatch);
router.patch("/:id/bot", matchController.changeBot);
router.post("/:id/run", matchController.runMatch);

module.exports = router;