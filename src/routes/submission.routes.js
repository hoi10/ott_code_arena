const express = require("express");
const submissionController = require("../controllers/submission.controller");
const authMiddleware = require("../middlewares/auth.middleware");

const router = express.Router();

router.use(authMiddleware);

router.get("/", submissionController.getMySubmissions);
router.get("/:id", submissionController.getSubmissionById);
router.post("/", submissionController.createSubmission);

module.exports = router;