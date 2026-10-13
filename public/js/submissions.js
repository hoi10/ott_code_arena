const SUBMISSIONS_PER_PAGE = 10;
let currentSubmissionPage = 1;
let currentSubmissionTotalPages = 1;
let ownedBots = [];

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("submissionForm")?.addEventListener("submit", openPlayground);
  document.getElementById("loadBotCodeBtn")?.addEventListener("click", loadSelectedBotCode);
  document.getElementById("previousPageBtn")?.addEventListener("click", () => {
    if (currentSubmissionPage > 1) loadSubmissions(currentSubmissionPage - 1);
  });
  document.getElementById("nextPageBtn")?.addEventListener("click", () => {
    if (currentSubmissionPage < currentSubmissionTotalPages) {
      loadSubmissions(currentSubmissionPage + 1);
    }
  });
  loadOwnedBots();
  loadSubmissions();
});

async function loadOwnedBots() {
  const select = document.getElementById("submissionBot");
  try {
    const response = await window.api.get("/bots");
    const result = response?.data ?? response;
    ownedBots = Array.isArray(result) ? result : result.bots ?? result.items;
    if (!Array.isArray(ownedBots)) throw new Error("Danh sách bot không hợp lệ.");

    select.replaceChildren(new Option("Chọn bot để dùng mã đã lưu", ""));
    ownedBots.forEach((bot) => {
      select.add(new Option(`${bot.name} (#${bot.id})`, String(bot.id)));
    });
  } catch (error) {
    showAccountMessage("submissionMessage", `Không thể tải danh sách bot: ${error.message}`, "error");
  }
}

async function loadSelectedBotCode() {
  const selectedId = document.getElementById("submissionBot").value;
  if (!selectedId) {
    showAccountMessage("submissionMessage", "Hãy chọn bot cần nạp mã.", "error");
    return;
  }

  const bot = ownedBots.find((item) => String(item.id) === selectedId);
  if (!bot) {
    showAccountMessage("submissionMessage", "Không tìm thấy bot đã chọn.", "error");
    return;
  }
  document.getElementById("submissionCode").value = bot.sourceCode || "";
  showAccountMessage("submissionMessage", `Đã nạp mã của ${bot.name}.`, "success");
}

async function openPlayground(event) {
  event.preventDefault();
  const botId = document.getElementById("submissionBot").value;
  const sourceCode = document.getElementById("submissionCode").value;
  if (!botId && !sourceCode.trim()) {
    showAccountMessage("submissionMessage", "Chọn bot hoặc nhập mã nguồn trước khi gửi.", "error");
    return;
  }

  try {
    const selectedBot = ownedBots.find((item) => String(item.id) === botId);
    sessionStorage.setItem("ott-code-arena-playground-context", JSON.stringify({
      origin: "submissions",
      botId: botId ? Number(botId) : null,
      language: selectedBot?.language || "javascript",
      protocolVersion: selectedBot?.protocolVersion || 2,
      sourceCode: sourceCode.trim() || selectedBot?.sourceCode || ""
    }));
    window.location.href = "/bot-playground.html?origin=submissions" +
      (botId ? "&botId=" + encodeURIComponent(botId) : "");
  } catch (error) {
    showAccountMessage("submissionMessage", `Không thể mở màn hình kiểm thử: ${error.message}`, "error");
  }
}

async function loadSubmissions(page = currentSubmissionPage) {
  const container = document.getElementById("submissionsList");
  container.replaceChildren(createLoadingState());
  try {
    const response = await window.api.get(
      `/submissions?page=${encodeURIComponent(page)}&limit=${SUBMISSIONS_PER_PAGE}`
    );
    const result = response?.data ?? response;
    const submissions = result.submissions;
    const pagination = result.pagination;
    if (!Array.isArray(submissions) || !pagination) {
      throw new Error("Dữ liệu lịch sử kiểm thử không hợp lệ.");
    }

    currentSubmissionPage = pagination.page;
    currentSubmissionTotalPages = Math.max(1, pagination.totalPages || 1);
    document.getElementById("submissionPageLabel").textContent =
      `${pagination.total} lượt kiểm thử · Trang ${currentSubmissionPage}/${currentSubmissionTotalPages}`;
    document.getElementById("previousPageBtn").disabled = currentSubmissionPage <= 1;
    document.getElementById("nextPageBtn").disabled =
      currentSubmissionPage >= currentSubmissionTotalPages;

    if (submissions.length === 0) {
      const empty = document.createElement("div");
      empty.className = "submission-empty-state";
      empty.textContent = "Chưa có lượt kiểm thử nào. Hãy chạy bot để xem kết quả tại đây.";
      container.replaceChildren(empty);
      return;
    }
    container.replaceChildren(...submissions.map(createSubmissionEntry));
  } catch (error) {
    const failure = document.createElement("div");
    failure.className = "submission-empty-state";
    failure.textContent = `Không thể tải lịch sử kiểm thử: ${error.message}`;
    container.replaceChildren(failure);
    document.getElementById("submissionPageLabel").textContent = "Không tải được lịch sử kiểm thử";
  }
}

function createSubmissionEntry(submission) {
  const article = document.createElement("article");
  article.className = "submission-entry";

  const header = document.createElement("div");
  header.className = "submission-entry-header";
  const title = document.createElement("h3");
  title.textContent = submission.bot?.name || `Lượt kiểm thử #${submission.id}`;
  const status = document.createElement("span");
  status.className = `submission-status-badge ${safeStatus(submission.status)}`;
  status.textContent = formatSubmissionStatus(submission.status);
  header.append(title, status);

  const meta = document.createElement("p");
  meta.className = "submission-entry-meta";
  meta.textContent = `${formatSubmissionDate(submission.createdAt)} · ${submission.language || "JavaScript"}`;

  const details = document.createElement("details");
  const summary = document.createElement("summary");
  summary.textContent = "Xem mã nguồn và kết quả";
  const code = document.createElement("pre");
  code.textContent = submission.sourceCode || "";
  const result = document.createElement("pre");
  result.textContent = JSON.stringify(submission.result ?? {}, null, 2);
  details.append(summary, code, result);
  article.append(header, meta, details);
  return article;
}

function showSubmissionResult(submission) {
  const result = submission.result || {};
  const container = document.getElementById("submissionResult");
  container.className = `submission-result ${safeStatus(submission.status)}`;
  container.replaceChildren();

  const heading = document.createElement("h3");
  heading.textContent = {
    accepted: "Nước đi hợp lệ",
    rejected: "Bot trả về nước đi không hợp lệ",
    failed: "Bot không chạy được",
  }[submission.status] || `Kết quả: ${formatSubmissionStatus(submission.status)}`;
  const detail = document.createElement("p");
  detail.textContent = result.action?.to
    ? `Quân ${result.action.pieceId} đi đến ${result.action.to.name || `(${result.action.to.x}, ${result.action.to.y})`}.`
    : describeTestReason(result.reason || result.error) || "Không có thêm thông tin.";
  container.append(heading, detail);
  container.hidden = false;
}

function createLoadingState() {
  const loading = document.createElement("div");
  loading.className = "submission-empty-state";
  loading.textContent = "Đang tải lịch sử kiểm thử...";
  return loading;
}

function safeStatus(value) {
  return ["accepted", "rejected", "failed"].includes(value) ? value : "unknown";
}

function formatSubmissionStatus(status) {
  return {
    accepted: "Nước đi hợp lệ",
    rejected: "Nước đi chưa hợp lệ",
    failed: "Bot gặp lỗi",
  }[status] || "Chưa xác định";
}

function describeTestReason(reason) {
  if (!reason) return "";
  return {
    INVALID_ACTION_FORMAT: "Bot trả về dữ liệu nước đi không đúng định dạng.",
    INVALID_PIECE_ID: "Không tìm thấy mã quân cờ.",
    PIECE_NOT_FOUND: "Quân cờ không thuộc về bot.",
    INVALID_DESTINATION: "Ô đích không hợp lệ.",
    MOVE_OUT_OF_RANGE: "Quân chỉ được đi một ô mỗi lượt.",
    FRIENDLY_PIECE_BLOCKS_DESTINATION: "Ô đích đang có quân cùng phe.",
    OPPONENT_PIECE_BLOCKS_DESTINATION: "Quân không thể ăn quân đối thủ ở ô này.",
    BOT_EXECUTION_TIMEOUT: "Bot chạy quá thời gian cho phép.",
    BOT_EXECUTION_FAILED: "Đã xảy ra lỗi khi chạy bot.",
    BOT_OUTPUT_LIMIT_EXCEEDED: "Kết quả bot trả về vượt quá giới hạn.",
  }[reason] || reason;
}

function formatSubmissionDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Ngày tạo không xác định"
    : new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function showAccountMessage(id, message, type) {
  const element = document.getElementById(id);
  element.textContent = message;
  element.className = `account-message ${type}`;
  element.hidden = false;
}
