const express = require("express");
const friendController = require("../controllers/friend.controller");
const authMiddleware = require("../middlewares/auth.middleware");

const router = express.Router();

router.use(authMiddleware);
router.get("/", friendController.list);
router.get("/search", friendController.search);
router.get("/notifications", friendController.notifications);
router.post("/presence", friendController.heartbeat);
router.post("/requests", friendController.sendRequest);
router.post("/requests/:requestId/respond", friendController.respondRequest);
router.delete("/:friendId", friendController.remove);
router.post("/:friendId/challenges", friendController.challenge);
router.post("/invitations/:invitationId/respond", friendController.respondChallenge);
router.post(
  "/invitations/:invitationId/room-ready",
  friendController.consumeCompletedChallenge
);
router.post(
  "/invitations/:invitationId/expire-without-bot",
  friendController.expireChallengeWithoutBot
);
router.post("/rooms/:roomId/invitations", friendController.inviteToRoom);
router.post(
  "/room-invitations/:invitationId/respond",
  friendController.respondRoomInvitation
);

module.exports = router;
