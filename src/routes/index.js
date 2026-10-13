const express = require("express");
const authRoutes = require("./auth.routes");
const userRoutes = require("./user.routes");
const botRoutes = require("./bot.routes");
const matchRoutes = require("./match.routes");
const submissionRoutes = require("./submission.routes");
const roomRoutes = require("./room.routes");
const friendRoutes = require("./friend.routes");
const tournamentRoutes = require("./tournament.routes");

const router = express.Router();

router.use("/auth", authRoutes);
router.use("/users", userRoutes);
router.use("/bots", botRoutes);
router.use("/matches", matchRoutes);
router.use("/rooms", roomRoutes);
router.use("/friends", friendRoutes);
router.use("/submissions", submissionRoutes);
router.use("/tournaments", tournamentRoutes);

module.exports = router;