const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const userRepository = require("../repositories/user.repository");

const authService = {
  async register({ username, email, password }) {
    const existingUsername = await userRepository.findByUsername(username);

    if (existingUsername) {
      throw new Error("USERNAME_ALREADY_EXISTS");
    }

    const existingEmail = await userRepository.findByEmail(email);

    if (existingEmail) {
      throw new Error("EMAIL_ALREADY_EXISTS");
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const user = await userRepository.create({
      username,
      email,
      password: hashedPassword,
    });

    const { password: _, ...safeUser } = user;

    return safeUser;
  },

  async login({ email, password }) {
    const user = await userRepository.findByEmail(email);

    if (!user) {
      throw new Error("INVALID_CREDENTIALS");
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      throw new Error("INVALID_CREDENTIALS");
    }

    if (!process.env.JWT_SECRET) {
      throw new Error("JWT_SECRET_NOT_CONFIGURED");
    }

    const token = jwt.sign(
      {
        userId: user.id,
        username: user.username,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: process.env.JWT_EXPIRES_IN || "1d",
      }
    );

    const { password: _, ...safeUser } = user;

    return {
      user: safeUser,
      token,
    };
  },
};

module.exports = authService;