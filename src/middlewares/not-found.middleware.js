function notFoundMiddleware(req, res) {
  return res.status(404).json({
    success: false,
    message: "Không tìm thấy địa chỉ bạn yêu cầu.",
  });
}

module.exports = notFoundMiddleware;