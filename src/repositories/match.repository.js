const prisma = require("../config/database");

function userMatchFilter(userId) {
  if (!userId) return {};
  return {
    OR: [
      { participants: { some: { bot: { userId } } } },
      {
        room: {
          is: {
            players: { some: { userId, leftAt: null } },
          },
        },
      },
    ],
  };
}

const matchRepository = {
  async findById(id) {
    return prisma.match.findUnique({
      where: { id },
      include: {
        participants: {
          include: {
            bot: {
              include: {
                user: {
                  select: {
                    id: true,
                    username: true,
                  },
                },
              },
            },
          },
        },
      },
    });
  },

  async findMany({ skip = 0, take = 20, status, userId } = {}) {
    return prisma.match.findMany({
      where: {
        ...(status ? { status } : {}),
        ...userMatchFilter(userId),
      },
      skip,
      take,
      orderBy: {
        createdAt: "desc",
      },
      include: {
        participants: {
          include: {
            bot: {
              select: {
                id: true,
                name: true,
                userId: true,
                user: {
                  select: {
                    id: true,
                    username: true,
                  },
                },
              },
            },
          },
        },
      },
    });
  },

  async count({ status, userId } = {}) {
    return prisma.match.count({
      where: {
        ...(status ? { status } : {}),
        ...userMatchFilter(userId),
      },
    });
  },

  async createWithParticipants(botIds) {
    return prisma.match.create({
      data: {
        status: "pending",
        participants: {
          create: botIds.map((botId) => ({
            botId,
          })),
        },
      },
      include: {
        participants: {
          include: {
            bot: {
              select: {
                id: true,
                name: true,
                userId: true,
              },
            },
          },
        },
      },
    });
  },

  async updateParticipantBot(matchId, participantId, botId) {
    return prisma.matchParticipant.update({
      where: { id: participantId, matchId },
      data: { botId },
    });
  },

  async updateResult(
    id,
    { status, winnerId, result, startedAt, endedAt }
  ) {
    return prisma.match.update({
      where: { id },
      data: {
        status,
        winnerId,
        result,
        startedAt,
        endedAt,
      },
      include: {
        participants: {
          include: {
            bot: {
              select: {
                id: true,
                name: true,
                userId: true,
              },
            },
          },
        },
      },
    });
  },

  async updateParticipantScoreById(participantId, score, isWinner) {
    return prisma.matchParticipant.update({
      where: { id: participantId },
      data: { score, isWinner },
    });
  },
};

module.exports = matchRepository;