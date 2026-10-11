const express = require("express");
const roomController = require("../controllers/room.controller");
const authMiddleware = require("../middlewares/auth.middleware");

const router = express.Router();

function optionalAuth(req, res, next) {
  if (!req.headers.authorization) return next();
  return authMiddleware(req, res, next);
}

router.get("/public", roomController.listPublic);
router.get("/live", roomController.listLivePublic);
router.get("/search", roomController.search);
router.get("/mine", authMiddleware, roomController.listMine);
router.post("/", authMiddleware, roomController.create);
router.post("/:id/join", authMiddleware, roomController.join);
router.post("/:id/viewer-session", roomController.createViewerSession);
router.get("/:id", optionalAuth, roomController.get);
router.post("/:id/presence", optionalAuth, roomController.heartbeat);
router.post("/:id/leave-viewer", roomController.leaveViewer);
router.patch("/:id/ready", authMiddleware, roomController.setReady);
router.post("/:id/start", authMiddleware, roomController.start);
router.post("/:id/pause", authMiddleware, roomController.pause);
router.post("/:id/resume", authMiddleware, roomController.resume);
router.patch("/:id/bot", authMiddleware, roomController.changeBot);
router.post("/:id/leave", authMiddleware, roomController.leave);
router.post("/:id/rematch", authMiddleware, roomController.requestRematch);
router.post("/:id/rematch/respond", authMiddleware, roomController.respondRematch);
router.delete("/:id", authMiddleware, roomController.dissolve);

module.exports = router;
