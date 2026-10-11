const express = require("express");
const userController = require("../controllers/user.controller");
const authMiddleware = require("../middlewares/auth.middleware");

const router = express.Router();

router.use(authMiddleware);

router.get("/profile", userController.getProfile);
router.patch("/profile", userController.updateProfile);
router.get("/stats", userController.getUserStats);
router.patch("/password", userController.changePassword);

module.exports = router;