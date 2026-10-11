const { ZodError } = require("zod");

function errorMiddleware(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  if (err instanceof ZodError) {
    return res.status(400).json({
      success: false,
      message: "Dữ liệu gửi lên chưa hợp lệ.",
      errors: err.issues.map((issue) => ({
        field: issue.path.join("."),
        message: describeValidationIssue(issue),
      })),
    });
  }

  const errorMap = {
    USERNAME_ALREADY_EXISTS: {
      status: 409,
      message: "Tên người dùng này đã được sử dụng.",
    },
    EMAIL_ALREADY_EXISTS: {
      status: 409,
      message: "Địa chỉ email này đã được đăng ký.",
    },
    USER_NOT_FOUND: {
      status: 404,
      message: "Không tìm thấy người dùng.",
    },
    CURRENT_PASSWORD_INCORRECT: {
      status: 401,
      message: "Mật khẩu hiện tại không chính xác.",
    },
    INVALID_CREDENTIALS: {
      status: 401,
      message: "Email hoặc mật khẩu không chính xác.",
    },
    JWT_SECRET_NOT_CONFIGURED: {
      status: 500,
      message: "Dịch vụ xác thực chưa được cấu hình.",
    },
    MATCH_REQUIRES_TWO_BOTS: {
      status: 400,
      message: "Một trận đấu cần có đúng hai bot.",
    },
    MATCH_REQUIRES_TWO_DIFFERENT_BOTS: {
      status: 400,
      message: "Không thể cho một bot đấu với chính nó.",
    },
    MATCH_BOTS_NOT_FOUND_OR_INACTIVE: {
      status: 404,
      message: "Không tìm thấy một hoặc cả hai bot, hoặc bot đã bị tắt.",
    },
    MATCH_REQUIRES_TWO_PARTICIPANTS: {
      status: 400,
      message: "Một trận đấu cần có đúng hai người chơi.",
    },
    MATCH_REQUIRES_OWNED_BOT: {
      status: 403,
      message: "Trận đấu phải có bot của bạn.",
    },
    MATCH_OPPONENT_BOT_NOT_PUBLIC: {
      status: 403,
      message: "Bot đối thủ đang ở chế độ riêng tư.",
    },
    MATCH_NOT_FOUND: {
      status: 404,
      message: "Không tìm thấy trận đấu.",
    },
    MATCH_ACCESS_DENIED: {
      status: 403,
      message: "Bạn không điều khiển bot nào trong trận đấu này.",
    },
    MATCH_NOT_RUNNING: {
      status: 409,
      message: "Trận đấu hiện không diễn ra.",
    },
    MATCH_PARTICIPANT_NOT_FOUND: {
      status: 404,
      message: "Không tìm thấy người chơi trong trận đấu.",
    },
    BOT_SWITCH_ONLY_DURING_OPPONENT_TURN: {
      status: 409,
      message: "Chỉ có thể đổi bot khi đang đến lượt đối thủ.",
    },
    BOT_NOT_FOUND_OR_INACTIVE: {
      status: 404,
      message: "Không tìm thấy bot hoặc bot đã bị tắt.",
    },
    BOT_ALREADY_IN_MATCH: {
      status: 409,
      message: "Không thể xóa bot đang tham gia trận đấu.",
    },
    BOT_ALREADY_ASSIGNED_TO_MATCH: {
      status: 409,
      message: "Bot này đã được chọn cho phía đối thủ.",
    },
    BOT_NOT_FOUND: {
      status: 404,
      message: "Không tìm thấy bot.",
    },
    BOT_INACTIVE: {
      status: 409,
      message: "Bot này hiện đã bị tắt.",
    },
    BOT_ACCESS_DENIED: {
      status: 403,
      message: "Bạn không có quyền sử dụng bot này.",
    },
    SOURCE_CODE_REQUIRED: {
      status: 400,
      message: "Hãy chọn bot hoặc cung cấp mã nguồn bot.",
    },
    SUBMISSION_NOT_FOUND: {
      status: 404,
      message: "Không tìm thấy lượt kiểm thử.",
    },
    ROOM_ID_INVALID: { status: 400, message: "Mã phòng không hợp lệ." },
    ROOM_NAME_ALREADY_EXISTS: { status: 409, message: "Tên phòng này đã được sử dụng." },
    ROOM_REQUIRES_ACTIVE_BOT: {
      status: 400,
      message: "Bạn cần có ít nhất một bot đang hoạt động để tham gia thi đấu.",
    },
    ROOM_PLAYER_ALREADY_IN_ROOM: {
      status: 409,
      message: "Bạn đang là người chơi trong một phòng khác. Hãy rời phòng hiện tại trước khi tạo hoặc tham gia phòng mới.",
    },
    FRIEND_ID_INVALID: { status: 400, message: "Thông tin bạn bè không hợp lệ." },
    FRIEND_CANNOT_ADD_SELF: {
      status: 400,
      message: "Bạn không thể gửi lời mời kết bạn cho chính mình.",
    },
    FRIEND_CANNOT_CHALLENGE_SELF: {
      status: 400,
      message: "Bạn không thể mời chính mình thi đấu.",
    },
    FRIEND_ALREADY_EXISTS: { status: 409, message: "Hai người đã là bạn bè." },
    FRIEND_REQUEST_ALREADY_SENT: {
      status: 409,
      message: "Lời mời kết bạn đang chờ phản hồi.",
    },
    FRIEND_REQUEST_ALREADY_RECEIVED: {
      status: 409,
      message: "Người này đã gửi lời mời kết bạn cho bạn.",
    },
    FRIEND_REQUEST_NOT_FOUND: {
      status: 404,
      message: "Lời mời kết bạn không còn tồn tại hoặc không dành cho bạn.",
    },
    FRIEND_NOT_FOUND: { status: 404, message: "Không tìm thấy bạn bè này." },
    FRIEND_REQUIRED: { status: 403, message: "Bạn cần là bạn bè để gửi lời mời này." },
    FRIEND_NOT_ONLINE: { status: 409, message: "Bạn bè hiện không trực tuyến." },
    SOCIAL_INVITATION_ALREADY_PENDING: {
      status: 409,
      message: "Lời mời tương tự đang chờ phản hồi.",
    },
    SOCIAL_INVITATION_EXPIRED_OR_UNAVAILABLE: {
      status: 409,
      message: "Lời mời đã hết hạn hoặc không còn khả dụng.",
    },
    DUEL_INVITATION_UNAVAILABLE: {
      status: 409,
      message: "Lời mời thi đấu không còn khả dụng.",
    },
    DUEL_INVITATION_CANNOT_EXPIRE: {
      status: 409,
      message: "Lời mời chỉ có thể kết thúc khi bạn không có bot đang hoạt động.",
    },
    ROOM_PASSWORD_INCORRECT: { status: 401, message: "Mật khẩu phòng không chính xác." },
    ROOM_NOT_FOUND: { status: 404, message: "Không tìm thấy phòng đấu." },
    ROOM_NOT_FOUND_OR_NOT_WAITING: {
      status: 409,
      message: "Phòng không còn chờ người chơi hoặc không tồn tại.",
    },
    ROOM_NOT_ACCEPTING_PLAYERS: {
      status: 409,
      message: "Phòng không còn nhận người chơi.",
    },
    ROOM_FULL_OR_NOT_ACCEPTING_PLAYERS: {
      status: 409,
      message: "Phòng đã đủ người hoặc không còn nhận người chơi.",
    },
    ROOM_REQUIRES_TWO_PLAYERS: {
      status: 409,
      message: "Cần đủ hai người chơi trong phòng để bắt đầu.",
    },
    ROOM_PLAYERS_NOT_READY: {
      status: 409,
      message: "Cả hai người chơi cần chọn bot và sẵn sàng trước khi bắt đầu.",
    },
    ROOM_BOT_NOT_FOUND_OR_INACTIVE: {
      status: 400,
      message: "Bot không tồn tại, đã bị tắt hoặc không thuộc về bạn.",
    },
    ROOM_NOT_RUNNING: { status: 409, message: "Phòng hiện không có trận đang chạy." },
    ROOM_NOT_PAUSED: { status: 409, message: "Trận đấu hiện không tạm dừng." },
    ROOM_PAUSE_BUDGET_EXHAUSTED: {
      status: 409,
      message: "Bạn đã dùng hết 30 giây tạm dừng của mình.",
    },
    ROOM_ACCESS_DENIED: { status: 403, message: "Bạn không phải người chơi trong phòng này." },
    ROOM_VIEW_ACCESS_DENIED: {
      status: 403,
      message: "Nhập đúng mật khẩu phòng để xem trận đấu.",
    },
    ROOM_HOST_ONLY: { status: 403, message: "Chỉ chủ phòng mới có thể thực hiện thao tác này." },
    ROOM_BOT_CHANGE_REQUIRES_PAUSE: {
      status: 409,
      message: "Chỉ có thể đổi bot khi trận đấu đang tạm dừng.",
    },
    ROOM_LEAVE_ONLY_AFTER_MATCH: {
      status: 409,
      message: "Chỉ có thể rời phòng sau khi trận đấu kết thúc.",
    },
    ROOM_HOST_MUST_DISSOLVE: {
      status: 409,
      message: "Chủ phòng cần giải tán phòng thay vì rời khỏi phòng.",
    },
    ROOM_REMATCH_UNAVAILABLE: {
      status: 409,
      message: "Phòng hiện không thể bắt đầu một trận đấu tiếp theo.",
    },
    ROOM_REMATCH_EXPIRED: {
      status: 409,
      message: "Lời mời đấu tiếp đã hết hạn. Bạn có thể gửi lời mời mới.",
    },
  };

  const knownError = errorMap[err.message];

  if (knownError) {
    return res.status(knownError.status).json({
      success: false,
      code: err.message,
      message: knownError.message,
    });
  }

  console.error(err);

  return res.status(500).json({
    success: false,
    message: "Đã xảy ra lỗi máy chủ. Vui lòng thử lại sau.",
  });
}

function describeValidationIssue(issue) {
  const fieldNames = {
    username: "Tên người dùng",
    email: "Địa chỉ email",
    password: "Mật khẩu",
    currentPassword: "Mật khẩu hiện tại",
    newPassword: "Mật khẩu mới",
    name: "Tên bot",
    description: "Mô tả",
    sourceCode: "Mã nguồn",
    botId: "Bot",
    botIds: "Danh sách bot",
    participantId: "Người chơi",
    page: "Trang",
    limit: "Số lượng",
  };
  const field = fieldNames[issue.path.at(-1)] || "Giá trị";

  if (issue.code === "custom") {
    const customMessages = {
      "At least one field must be provided": "Hãy cung cấp ít nhất một thông tin cần cập nhật.",
      "New password must be different from the current password": "Mật khẩu mới phải khác mật khẩu hiện tại.",
      "A match must contain exactly 2 bots": "Một trận đấu cần có đúng hai bot.",
      "A bot cannot compete against itself": "Không thể cho một bot đấu với chính nó.",
      "Provide a botId or sourceCode": "Hãy chọn bot hoặc cung cấp mã nguồn bot.",
    };
    return customMessages[issue.message] || "Thông tin này chưa hợp lệ.";
  }

  if (issue.code === "invalid_format" && issue.format === "email") {
    return "Địa chỉ email không hợp lệ.";
  }

  if (issue.code === "too_small") {
    return issue.origin === "string"
      ? `${field} cần có ít nhất ${issue.minimum} ký tự.`
      : `${field} cần có giá trị lớn hơn hoặc bằng ${issue.minimum}.`;
  }

  if (issue.code === "too_big") {
    return issue.origin === "string"
      ? `${field} không được vượt quá ${issue.maximum} ký tự.`
      : `${field} không được lớn hơn ${issue.maximum}.`;
  }

  if (issue.code === "invalid_value") {
    return `${field} không hợp lệ hoặc chưa được hỗ trợ.`;
  }

  if (issue.code === "invalid_type") {
    return `${field} chưa đúng định dạng hoặc đang bị thiếu.`;
  }

  return `${field} chưa hợp lệ.`;
}

module.exports = errorMiddleware;