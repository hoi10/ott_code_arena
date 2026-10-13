"use strict";

let currentStatus = "";

const STATUS_LABELS = {
  draft: "Nháp",
  ready: "Sẵn sàng",
  running: "Đang chạy",
  completed: "Hoàn tất",
  cancelled: "Đã hủy",
};

document.addEventListener("DOMContentLoaded", () => {
  if (!localStorage.getItem("token")) {
    window.location.replace("/login.html");
    return;
  }

  document.getElementById("openCreateBtn").addEventListener("click", () => {
    document.getElementById("createCard").hidden = false;
    document.getElementById("tournamentName").focus();
  });
  document.getElementById("cancelCreateBtn").addEventListener("click", () => {
    document.getElementById("createCard").hidden = true;
  });
  document.getElementById("createForm").addEventListener("submit", handleCreate);

  document.getElementById("filterRow").addEventListener("click", (event) => {
    const chip = event.target.closest(".tournaments-filter-chip");
    if (!chip) return;
    currentStatus = chip.dataset.status || "";
    document.querySelectorAll(".tournaments-filter-chip").forEach((el) => {
      el.classList.toggle("active", el === chip);
    });
    loadTournaments();
  });

  loadTournaments();
  // Bounded polling keeps the list fresh without a realtime channel.
  window.setInterval(() => void loadTournaments(true), 8000);
});

async function loadTournaments(silent = false) {
  const container = document.getElementById("tournamentList");
  if (!silent) {
    container.replaceChildren(createLoadingState());
  }
  try {
    const query = currentStatus ? `?status=${encodeURIComponent(currentStatus)}` : "";
    const response = await window.api.get(`/tournaments${query}`);
    const result = response?.data ?? response;
    const tournaments = Array.isArray(result) ? result : result.tournaments ?? [];

    if (tournaments.length === 0) {
      container.replaceChildren(createEmptyState());
      return;
    }
    container.replaceChildren(...tournaments.map(createTournamentCard));
  } catch (error) {
    console.error("Không thể tải danh sách giải đấu:", error.message);
    if (!silent) {
      container.replaceChildren(createErrorState(error.message));
    }
  }
}

async function handleCreate(event) {
  event.preventDefault();
  const name = document.getElementById("tournamentName").value.trim();
  const description = document.getElementById("tournamentDescription").value.trim();

  if (name.length < 2) {
    showMessage("Tên giải đấu cần ít nhất 2 ký tự.", "error");
    return;
  }

  try {
    const response = await window.api.post("/tournaments", {
      name,
      description: description || null,
    });
    showMessage("Đã tạo giải đấu thành công.", "success");
    const tournament = response?.data?.tournament;
    document.getElementById("createForm").reset();
    document.getElementById("createCard").hidden = true;
    if (tournament?.id) {
      window.location.href = `/tournament-detail.html?id=${encodeURIComponent(tournament.id)}`;
    } else {
      await loadTournaments();
    }
  } catch (error) {
    showMessage(error.message || "Không thể tạo giải đấu.", "error");
  }
}

function createTournamentCard(tournament) {
  const card = document.createElement("a");
  card.className = "tournament-card";
  card.href = `/tournament-detail.html?id=${encodeURIComponent(tournament.id)}`;

  const head = document.createElement("div");
  head.className = "tournament-card-head";

  const title = document.createElement("h3");
  title.textContent = tournament.name || "Giải đấu";
  head.append(title);

  const badge = document.createElement("span");
  badge.className = `tournament-status-badge ${safeStatus(tournament.status)}`;
  badge.textContent = STATUS_LABELS[tournament.status] || "Không rõ";
  head.append(badge);

  const meta = document.createElement("div");
  meta.className = "tournament-card-meta";
  const entryCount = tournament._count?.entries ?? tournament.entries?.length ?? 0;
  meta.append(
    makeMeta("Chủ giải", tournament.hostUser?.username || "—"),
    makeMeta("Người tham gia", String(entryCount))
  );

  card.append(head, meta);

  const completed = tournament.progress?.completed ?? 0;
  const total = tournament.progress?.total ?? 0;
  if (total > 0) {
    const percent = Math.round((completed / total) * 100);
    const progress = document.createElement("div");
    progress.className = "tournament-card-progress";
    const bar = document.createElement("span");
    bar.style.width = `${percent}%`;
    progress.append(bar);
    card.append(progress);

    const progressLabel = document.createElement("div");
    progressLabel.className = "tournament-card-meta";
    progressLabel.append(makeMeta("Tiến độ", `${completed}/${total} trận`));
    card.append(progressLabel);
  }

  return card;
}

function makeMeta(label, value) {
  const span = document.createElement("span");
  const strong = document.createElement("strong");
  strong.textContent = `${label}: `;
  span.append(strong, document.createTextNode(value));
  return span;
}

function safeStatus(value) {
  return Object.prototype.hasOwnProperty.call(STATUS_LABELS, value) ? value : "draft";
}

function createLoadingState() {
  const loading = document.createElement("div");
  loading.className = "loading-state";
  loading.innerHTML = '<div class="loading-spinner"></div><p>Đang tải danh sách giải đấu...</p>';
  return loading;
}

function createEmptyState() {
  const empty = document.createElement("section");
  empty.className = "tournaments-page-empty";
  const heading = document.createElement("h2");
  heading.textContent = "Chưa có giải đấu nào";
  const description = document.createElement("p");
  description.textContent = "Hãy tạo giải đấu đầu tiên và mời bot tham gia thi đấu.";
  const button = document.createElement("button");
  button.className = "btn btn-primary";
  button.type = "button";
  button.textContent = "Tạo giải đấu";
  button.addEventListener("click", () => {
    document.getElementById("createCard").hidden = false;
    document.getElementById("tournamentName").focus();
  });
  empty.append(heading, description, button);
  return empty;
}

function createErrorState(message) {
  const error = document.createElement("section");
  error.className = "tournaments-page-empty";
  const text = document.createElement("p");
  text.textContent = message || "Không thể tải danh sách giải đấu.";
  const retry = document.createElement("button");
  retry.className = "btn btn-secondary";
  retry.type = "button";
  retry.textContent = "Thử lại";
  retry.addEventListener("click", () => loadTournaments());
  error.append(text, retry);
  return error;
}

function showMessage(message, type) {
  const element = document.getElementById("pageMessage");
  element.textContent = message;
  element.className = `tournament-message ${type}`;
  element.hidden = false;
  window.setTimeout(() => {
    element.hidden = true;
  }, 4000);
}

