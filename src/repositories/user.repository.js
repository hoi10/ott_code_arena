const prisma = require("../config/database");

const userRepository = {
  // Tìm người dùng theo ID
  async findById(id) {
    return prisma.user.findUnique({
      where: { id },
    });
  },

  // Tìm người dùng theo username
  async findByUsername(username) {
    return prisma.user.findUnique({
      where: { username },
    });
  },

  // Tìm người dùng theo email
  async findByEmail(email) {
    return prisma.user.findUnique({
      where: { email },
    });
  },

  // Tạo người dùng mới
  async create(data) {
    return prisma.user.create({
      data,
    });
  },

  async update(id, data) {
    return prisma.user.update({
      where: { id },
      data,
    });
  },

  // Lấy danh sách bot của người dùng
  async findBotsByUserId(userId) {
    return prisma.bot.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
  },

  // Đếm số lượng bot của người dùng
  async countBotsByUserId(userId) {
    return prisma.bot.count({
      where: { userId },
    });
  },
};

module.exports = userRepository;