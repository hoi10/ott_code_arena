const prisma = require("../config/database");

const submissionRepository = {
  async findById(id) {
    return prisma.submission.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            username: true,
          },
        },
        bot: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  },

  async findByUserId(userId, { skip = 0, take = 20 } = {}) {
    return prisma.submission.findMany({
      where: { userId },
      skip,
      take,
      orderBy: { createdAt: "desc" },
      include: {
        bot: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  },

  async countByUserId(userId) {
    return prisma.submission.count({
      where: { userId },
    });
  },

  async create(data) {
    return prisma.submission.create({
      data,
      include: {
        bot: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  },

  async updateResult(id, { status, result }) {
    return prisma.submission.update({
      where: { id },
      data: { status, result },
    });
  },
};

module.exports = submissionRepository;