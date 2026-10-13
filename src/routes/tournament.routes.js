const express = require("express");
const tournamentController = require("../controllers/tournament.controller");
const authMiddleware = require("../middlewares/auth.middleware");

const router = express.Router();

router.use(authMiddleware);

router.get("/", tournamentController.list);
router.post("/", tournamentController.create);
router.get("/:id", tournamentController.get);
router.patch("/:id", tournamentController.update);

router.post("/:id/participants", tournamentController.addParticipant);
router.delete("/:id/participants", tournamentController.removeParticipant);

router.post("/:id/lock", tournamentController.lock);
router.post("/:id/start", tournamentController.start);
router.post("/:id/cancel", tournamentController.cancel);
router.post("/:id/retry-failed", tournamentController.retryFailed);

module.exports = router;
