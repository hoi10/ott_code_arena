const submissionService = require("../services/submission.service");
const {
  createSubmissionSchema,
  listSubmissionsSchema,
} = require("../validators/submission.validator");

const submissionController = {
  async getMySubmissions(req, res, next) {
    try {
      const { page, limit } = listSubmissionsSchema.parse(req.query);

      const result = await submissionService.getMySubmissions(
        req.user.id,
        page,
        limit
      );

      return res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },

  async getSubmissionById(req, res, next) {
    try {
      const submissionId = Number(req.params.id);

      if (!Number.isSafeInteger(submissionId) || submissionId <= 0) {
        return res.status(400).json({
          success: false,
          message: "Mã lượt kiểm thử không hợp lệ.",
        });
      }

      const submission = await submissionService.getSubmissionById(
        submissionId,
        req.user.id
      );

      return res.status(200).json({
        success: true,
        data: { submission },
      });
    } catch (error) {
      next(error);
    }
  },

  async createSubmission(req, res, next) {
    try {
      const validatedData = createSubmissionSchema.parse(req.body);

      const submission = await submissionService.createSubmission(
        req.user.id,
        validatedData
      );

      return res.status(201).json({
        success: true,
        message: "Đã chạy kiểm thử bot thành công.",
        data: { submission },
      });
    } catch (error) {
      next(error);
    }
  },
};

module.exports = submissionController;