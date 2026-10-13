const submissionRepository = require("../repositories/submission.repository");
const botRepository = require("../repositories/bot.repository");
const botService = require("./bot.service");

const submissionService = {
  async getMySubmissions(userId, page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const [submissions, total] = await Promise.all([
      submissionRepository.findByUserId(userId, { skip, take: limit }),
      submissionRepository.countByUserId(userId),
    ]);

    return {
      submissions,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  async getSubmissionById(submissionId, userId) {
    const submission = await submissionRepository.findById(submissionId);

    if (!submission || submission.userId !== userId) {
      throw new Error("SUBMISSION_NOT_FOUND");
    }

    return submission;
  },

  async createSubmission(userId, data) {
    let bot = null;

    if (data.botId !== undefined && data.botId !== null) {
      bot = await botRepository.findByIdAndUserId(
        data.botId,
        userId
      );

      if (!bot) {
        throw new Error("BOT_NOT_FOUND");
      }

      if (!bot.isActive) {
        throw new Error("BOT_INACTIVE");
      }

    }

    const sourceCode = data.sourceCode?.trim()
      ? data.sourceCode
      : bot?.sourceCode;
    if (!sourceCode?.trim()) {
      throw new Error("SOURCE_CODE_REQUIRED");
    }

    const language = data.sourceCode?.trim()
      ? data.language ?? bot?.language ?? "javascript"
      : bot?.language ?? data.language ?? "javascript";
    const protocolVersion = bot?.protocolVersion ?? data.protocolVersion ?? 2;

    const submission = await submissionRepository.create({
      userId,
      botId: bot?.id ?? null,
      sourceCode,
      language,
      protocolVersion,
      status: "pending",
    });

    try {
      const evaluation = await botService.testBot(
        sourceCode,
        language,
        data.testState ?? null,
        protocolVersion
      );
      return submissionRepository.updateResult(submission.id, {
        status: evaluation.valid ? "accepted" : (evaluation.error ? "failed" : "rejected"),
        result: evaluation,
      });
    } catch (error) {
      return submissionRepository.updateResult(submission.id, {
        status: "failed",
        result: {
          valid: false,
          error: error.message || "BOT_EXECUTION_FAILED",
        },
      });
    }
  },
};

module.exports = submissionService;
