const jwt = require("jsonwebtoken");

function authMiddleware(req, res, next) {
  const authorization = req.headers.authorization;

  if (!authorization || !authorization.startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      message: "Vui lòng đăng nhập để tiếp tục.",
    });
  }

  const token = authorization.slice(7);

  try {
    if (!process.env.JWT_SECRET) {
      throw new Error("JWT_SECRET_NOT_CONFIGURED");
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.user = {
      id: decoded.userId,
      username: decoded.username,
    };

    return next();
  } catch (error) {
    if (error.message === "JWT_SECRET_NOT_CONFIGURED") {
      return res.status(500).json({
        success: false,
        message: "Dịch vụ xác thực chưa được cấu hình.",
      });
    }

    return res.status(401).json({
      success: false,
      message: "Phiên đăng nhập không hợp lệ hoặc đã hết hạn.",
    });
  }
}

module.exports = authMiddleware;