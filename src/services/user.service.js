const userRepository = require("../repositories/user.repository");
const prisma = require("../config/database");
const bcrypt = require("bcrypt");

function withoutPassword(user) {
  const { password, ...safeUser } = user;
  return safeUser;
}

const userService = {
  async getProfile(userId) {
    const user = await userRepository.findById(userId);

    if (!user) {
      throw new Error("USER_NOT_FOUND");
    }

    return withoutPassword(user);
  },

  async updateProfile(userId, data) {
    const user = await userRepository.findById(userId);

    if (!user) {
      throw new Error("USER_NOT_FOUND");
    }

    if (data.username && data.username !== user.username) {
      const existingUser = await userRepository.findByUsername(data.username);

      if (existingUser) {
        throw new Error("USERNAME_ALREADY_EXISTS");
      }
    }

    return withoutPassword(await userRepository.update(userId, data));
  },

  async changePassword(userId, { currentPassword, newPassword }) {
    const user = await userRepository.findById(userId);

    if (!user) {
      throw new Error("USER_NOT_FOUND");
    }

    const isCurrentPasswordValid = await bcrypt.compare(
      currentPassword,
      user.password
    );

    if (!isCurrentPasswordValid) {
      throw new Error("CURRENT_PASSWORD_INCORRECT");
    }

    const password = await bcrypt.hash(newPassword, 12);
    await userRepository.update(userId, { password });

    return { success: true };
  },

  async getUserStats(userId) {
    const user = await userRepository.findById(userId);

    if (!user) {
      throw new Error("USER_NOT_FOUND");
    }

    const [totalBots, totalSubmissions, totalMatches, totalWins] = await Promise.all([
      userRepository.countBotsByUserId(userId),
      prisma.submission.count({ where: { userId } }),
      prisma.match.count({
        where: {
          participants: {
            some: {
              bot: {
                userId,
              },
            },
          },
        },
      }),
      prisma.match.count({
        where: {
          participants: {
            some: {
              isWinner: true,
              bot: {
                userId,
              },
            },
          },
        },
      }),
    ]);

    return {
      userId,
      username: user.username,
      totalBots,
      totalSubmissions,
      totalMatches,
      totalWins,
    };
  },
};

module.exports = userService;