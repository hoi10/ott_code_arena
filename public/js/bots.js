document.addEventListener("DOMContentLoaded", loadMyBots);

async function loadMyBots() {
  const container = document.getElementById("botsList");
  const countElement = document.getElementById("botCount");

  if (!container) return;

  try {
    const response = await window.api.get("/bots");
    const result = response?.data ?? response;
    const bots = Array.isArray(result)
      ? result
      : result.bots ?? result.items;

    if (!Array.isArray(bots)) {
      throw new Error("Máy chủ trả về danh sách bot không hợp lệ.");
    }

    if (countElement) {
      countElement.textContent = String(bots.length);
    }

    if (bots.length === 0) {
      renderEmptyState(container);
      return;
    }

    container.replaceChildren(
      ...bots.map((bot) => createBotDetails(bot))
    );

    const selectedBotId = new URLSearchParams(window.location.search).get("id");
    if (selectedBotId) {
      const selectedBot = bots.find(
        (bot) => String(bot.id) === selectedBotId
      );

      if (selectedBot) {
        document
          .getElementById(`bot-${selectedBot.id}`)
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
  } catch (error) {
    console.error("Không thể tải danh sách bot:", error.message);
    renderLoadError(container);
  }
}

function createBotDetails(bot) {
  const selectedBotId = new URLSearchParams(window.location.search).get("id");
  const card = document.createElement("article");
  card.className = "content-card bot-detail-card";
  card.id = `bot-${bot.id}`;

  const header = document.createElement("div");
  header.className = "bot-detail-header";

  const name = document.createElement("h2");
  name.textContent = bot.name || "Bot chưa có tên";
  header.append(name);

  const status = document.createElement("span");
  status.className = `bot-status${bot.isActive === false ? " inactive" : ""}`;
  status.textContent = bot.isActive === false ? "Đã tắt" : "Đang hoạt động";
  header.append(status);

  const description = document.createElement("p");
  description.className = "bot-detail-description";
  description.textContent = bot.description || "Chưa có mô tả.";

  const meta = document.createElement("div");
  meta.className = "bot-detail-meta";

  const language = document.createElement("span");
  const languageName = String(bot.language || "unknown").toLowerCase();
  language.className = `bot-language ${languageName}`;
  language.textContent = bot.language || "Chưa xác định ngôn ngữ";
  meta.append(language);

  const createdAt = document.createElement("span");
  createdAt.className = "bot-detail-created";
  createdAt.textContent = formatBotDate(bot.createdAt);
  meta.append(createdAt);

  const sourceDetails = document.createElement("details");
  sourceDetails.className = "bot-source-details";
  sourceDetails.open = String(bot.id) === selectedBotId;

  const sourceSummary = document.createElement("summary");
  sourceSummary.textContent = "Xem mã nguồn";

  const source = document.createElement("pre");
  const sourceCode = document.createElement("code");
  sourceCode.textContent = bot.sourceCode || "Bot chưa có mã nguồn.";
  source.append(sourceCode);

  sourceDetails.append(sourceSummary, source);

  const actions = document.createElement("div");
  actions.className = "bot-detail-meta";

  const editLink = document.createElement("a");
  editLink.className = "btn btn-secondary";
  editLink.href = `/create-bot.html?id=${encodeURIComponent(bot.id)}`;
  editLink.textContent = "Chỉnh sửa";

  const deleteButton = document.createElement("button");
  deleteButton.className = "btn btn-secondary";
  deleteButton.type = "button";
  deleteButton.textContent = "Xóa bot";
  deleteButton.addEventListener("click", async () => {
    if (!window.confirm(`Bạn có chắc muốn xóa bot "${bot.name}"?`)) return;
    deleteButton.disabled = true;
    try {
      await window.api.delete(`/bots/${encodeURIComponent(bot.id)}`);
      await loadMyBots();
    } catch (error) {
      console.error("Không thể xóa bot:", error);
      deleteButton.disabled = false;
      window.alert(`Không thể xóa bot: ${error.message}`);
    }
  });

  actions.append(editLink, deleteButton);
  card.append(header, description, meta, sourceDetails, actions);
  return card;
}

function formatBotDate(value) {
  if (!value) return "Chưa có ngày tạo";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Ngày tạo không hợp lệ";

  return `Tạo ngày ${new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "medium",
  }).format(date)}`;
}

function renderEmptyState(container) {
  const empty = document.createElement("section");
  empty.className = "bots-page-empty";

  const heading = document.createElement("h2");
  heading.textContent = "Bạn chưa có bot nào";

  const description = document.createElement("p");
  description.textContent = "Tạo bot đầu tiên để bắt đầu tham gia đấu trường.";

  const createLink = document.createElement("a");
  createLink.className = "btn btn-primary";
  createLink.href = "/create-bot.html";
  createLink.textContent = "Tạo bot mới";

  empty.append(heading, description, createLink);
  container.replaceChildren(empty);
}

function renderLoadError(container) {
  const errorState = document.createElement("section");
  errorState.className = "bots-page-empty";

  const message = document.createElement("p");
  message.textContent = "Không thể tải danh sách bot. Vui lòng thử lại.";

  const retryButton = document.createElement("button");
  retryButton.className = "btn btn-secondary";
  retryButton.type = "button";
  retryButton.textContent = "Thử lại";
  retryButton.addEventListener("click", loadMyBots);

  errorState.append(message, retryButton);
  container.replaceChildren(errorState);
}
