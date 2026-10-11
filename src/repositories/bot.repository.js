const prisma = require("../config/database");

const botRepository = {
  async findById(id) {
    return prisma.bot.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            username: true,
          },
        },
      },
    });
  },

  async findByIdAndUserId(id, userId) {
    return prisma.bot.findFirst({
      where: { id, userId },
    });
  },

  async findByUserId(userId) {
    return prisma.bot.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
  },

  async findPublicBots(userId) {
    return prisma.bot.findMany({
      where: {
        isPublic: true,
        userId: { not: userId },
        isActive: true,
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        description: true,
        language: true,
        createdAt: true,
        user: {
          select: {
            username: true,
          },
        },
      },
    });
  },

  async create(data) {
    return prisma.bot.create({ data });
  },

  async update(id, data) {
    return prisma.bot.update({
      where: { id },
      data,
    });
  },

  async delete(id) {
    return prisma.bot.delete({
      where: { id },
    });
  },

  async countMatchParticipants(botId) {
    return prisma.matchParticipant.count({ where: { botId } });
  },

  async findActiveBotsByIds(ids) {
    return prisma.bot.findMany({
      where: {
        id: { in: ids },
        isActive: true,
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
          },
        },
      },
    });
  },
};

module.exports = botRepository;