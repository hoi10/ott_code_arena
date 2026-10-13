"use strict";

const STATUS_LABELS = {
  draft: "Nháp",
  ready: "Sẵn sàng",
  running: "Đang chạy",
  completed: "Hoàn tất",
  cancelled: "Đã hủy",
};

let tournamentId = null;
let currentTournament = null;
let currentUserId = null;
let myBots = [];

document.addEventListener("DOMContentLoaded", () => {
  if (!localStorage.getItem("token")) {
    window.location.replace("/login.html");
    return;
  }

  const params = new URLSearchParams(window.location.search);
  tournamentId = params.get("id");
  if (!tournamentId) {
    renderFatal("Thiếu mã giải đấu trên đường dẫn.");
    return;
  }

  try {
    const stored = localStorage.getItem("user");
    if (stored) currentUserId = JSON.parse(stored)?.id ?? null;
  } catch {
    currentUserId = null;
  }

  document.getElementById("confirmCancelBtn").addEventListener("click", () => {
    document.getElementById("confirmDialog").close();
  });

  loadMyBots();
  loadDetail();
  window.setInterval(() => void loadDetail(true), 4000);
});

async function loadMyBots() {
  try {
    const response = await window.api.get("/bots");
    const result = response?.data ?? response;
    myBots = Array.isArray(result) ? result : result.bots ?? result.items ?? [];
  } catch {
    myBots = [];
  }
}

async function loadDetail(silent = false) {
  const root = document.getElementById("detailRoot");
  if (!silent) {
    root.replaceChildren(createLoadingState());
  }
  try {
    const response = await window.api.get(`/tournaments/${encodeURIComponent(tournamentId)}`);
    currentTournament = response?.data?.tournament;
    if (!currentTournament) throw new Error("Không tìm thấy giải đấu.");
    renderDetail(currentTournament);
  } catch (error) {
    console.error("Không thể tải chi tiết giải đấu:", error.message);
    if (!silent) {
      root.replaceChildren(createErrorState(error.message));
    }
  }
}

function isHost() {
  return currentUserId != null && currentTournament?.hostUserId === currentUserId;
}

function createLoadingState() {
  const loading = document.createElement("div");
  loading.className = "loading-state";
  loading.innerHTML = '<div class="loading-spinner"></div><p>Đang tải thông tin giải đấu...</p>';
  return loading;
}

function createErrorState(message) {
  const error = document.createElement("section");
  error.className = "tournaments-page-empty";
  const text = document.createElement("p");
  text.textContent = message || "Không thể tải chi tiết giải đấu.";
  const retry = document.createElement("button");
  retry.className = "btn btn-secondary";
  retry.type = "button";
  retry.textContent = "Thử lại";
  retry.addEventListener("click", () => loadDetail());
  error.append(text, retry);
  return error;
}

function renderFatal(message) {
  const root = document.getElementById("detailRoot");
  root.replaceChildren(createErrorState(message));
}

function renderDetail(tournament) {
  const root = document.getElementById("detailRoot");
  root.replaceChildren();

  const layout = el("div", "tournament-detail-layout");

  // ---- Info card ----
  const info = el("section", "content-card tournament-info-card");
  const head = el("div", "tournament-info-head");
  const title = el("h1");
  title.textContent = tournament.name || "Giải đấu";
  const badge = el("span", `tournament-status-badge ${safeStatus(tournament.status)}`);
  badge.textContent = STATUS_LABELS[tournament.status] || "Không rõ";
  head.append(title, badge);
  info.append(head);

  if (tournament.description) {
    const desc = el("p", "tournament-info-description");
    desc.textContent = tournament.description;
    info.append(desc);
  }

  const meta = el("div", "tournament-info-meta");
  meta.append(
    makeMeta("Chủ giải", tournament.hostUser?.username || "—"),
    makeMeta("Người tham gia", String(tournament.entries?.length ?? 0)),
    makeMeta("Thể thức", "Round Robin (2 lượt đổi bên)")
  );
  const completed = tournament.progress?.completed ?? 0;
  const total = tournament.progress?.total ?? 0;
  if (total > 0) {
    meta.append(makeMeta("Tiến độ", `${completed}/${total} trận`));
  }
  info.append(meta);

  if (isHost()) {
    info.append(buildHostActions(tournament));
  } else if (tournament.status === "draft") {
    info.append(buildSelfRegister());
  }

  layout.append(info);

  // ---- Participants ----
  layout.append(buildParticipantsSection(tournament));

  // ---- Schedule ----
  if (tournament.rounds?.length) {
    layout.append(buildScheduleSection(tournament));
  }

  // ---- Standings ----
  if (tournament.standings?.length) {
    layout.append(buildStandingsSection(tournament));
  }

  root.append(layout);
}

function buildHostActions(tournament) {
  const actions = el("div", "tournament-host-actions");

  if (tournament.status === "draft") {
    actions.append(
      actionButton("Chốt danh sách", "btn btn-primary", () =>
        confirmAction(
          "Chốt danh sách",
          "Sau khi chốt, danh sách và mã nguồn bot sẽ được đóng băng và không thể chỉnh sửa. Tiếp tục?",
          () => postAction(`/tournaments/${tournament.id}/lock`, "Đã chốt danh sách và tạo lịch thi đấu.")
        )
      ),
      actionButton("Hủy giải", "btn btn-secondary btn-danger", () =>
        confirmAction(
          "Hủy giải đấu",
          "Bạn có chắc muốn hủy giải đấu này?",
          () => postAction(`/tournaments/${tournament.id}/cancel`, "Đã hủy giải đấu.")
        )
      )
    );
  } else if (tournament.status === "ready") {
    actions.append(
      actionButton("Bắt đầu giải", "btn btn-primary", () =>
        confirmAction(
          "Bắt đầu giải đấu",
          "Giải sẽ bắt đầu chạy theo từng vòng. Bắt đầu ngay?",
          () => postAction(`/tournaments/${tournament.id}/start`, "Giải đấu đã bắt đầu.")
        )
      ),
      actionButton("Hủy giải", "btn btn-secondary btn-danger", () =>
        confirmAction(
          "Hủy giải đấu",
          "Bạn có chắc muốn hủy giải đấu này?",
          () => postAction(`/tournaments/${tournament.id}/cancel`, "Đã hủy giải đấu.")
        )
      )
    );
  } else if (tournament.status === "running") {
    const hasFailed = (tournament.progress?.failed ?? 0) > 0;
    if (hasFailed) {
      actions.append(
        actionButton("Chạy lại trận lỗi", "btn btn-primary", () =>
          postAction(`/tournaments/${tournament.id}/retry-failed`, "Đã đưa các trận lỗi vào hàng chờ.")
        )
      );
    }
  }

  return actions;
}

function buildSelfRegister() {
  const wrapper = el("div", "tournament-section");
  const heading = el("div", "tournament-section-heading");
  const h2 = el("h2");
  h2.innerHTML = '<span class="section-title-icon" aria-hidden="true">🤖</span> Tham gia giải đấu';
  heading.append(h2);
  wrapper.append(heading);

  if (myBots.length === 0) {
    const note = el("p", "tournament-info-description");
    note.textContent = "Bạn cần có ít nhất một bot để tham gia. Hãy tạo bot trước.";
    wrapper.append(note);
    return wrapper;
  }

  const form = el("form", "tournament-inline-form");
  const label = document.createElement("label");
  label.textContent = "Chọn bot của bạn";
  const select = document.createElement("select");
  select.id = "selfBotSelect";
  select.append(new Option("Chọn bot", ""));
  myBots.forEach((bot) => {
    select.add(new Option(`${bot.name} (#${bot.id})`, String(bot.id)));
  });
  label.append(select);
  form.append(label);
  const submit = el("button", "btn btn-primary");
  submit.type = "submit";
  submit.textContent = "Đăng ký tham gia";
  form.append(submit);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const botId = Number(select.value);
    if (!botId) {
      showMessage("Hãy chọn một bot.", "error");
      return;
    }
    try {
      await window.api.post(`/tournaments/${tournamentId}/participants`, { botId });
      showMessage("Đã đăng ký tham gia.", "success");
      await loadDetail(true);
    } catch (error) {
      showMessage(error.message || "Không thể đăng ký.", "error");
    }
  });

  wrapper.append(form);
  return wrapper;
}

function buildParticipantsSection(tournament) {
  const section = el("section", "content-card tournament-section");
  const heading = el("div", "tournament-section-heading");
  const h2 = el("h2");
  h2.innerHTML = '<span class="section-title-icon" aria-hidden="true">👥</span> Người tham gia';
  const note = el("p");
  note.textContent = `${tournament.entries?.length ?? 0} bot đã đăng ký${tournament.status === "draft" ? " · cần ít nhất 3 để chốt" : ""}`;
  heading.append(h2, note);
  section.append(heading);

  const list = el("div", "tournament-participant-list");
  const entries = tournament.entries ?? [];
  if (entries.length === 0) {
    const empty = el("p", "tournament-info-description");
    empty.textContent = "Chưa có người tham gia nào.";
    list.append(empty);
  } else {
    entries.forEach((entry) => list.append(buildParticipantRow(tournament, entry)));
  }
  section.append(list);
  return section;
}

function buildParticipantRow(tournament, entry) {
  const row = el("div", "tournament-participant");
  const identity = el("div", "tournament-participant-identity");

  const seed = el("span", "tournament-participant-seed");
  seed.textContent = String(entry.seed ?? "?");
  identity.append(seed);

  const info = el("div");
  const name = el("div", "tournament-participant-name");
  name.textContent = entry.user?.username || `Người chơi #${entry.userId}`;
  const botLine = el("div", "tournament-participant-bot");
  botLine.textContent = `Bot: ${entry.bot?.name || "—"}`;
  info.append(name, botLine);
  identity.append(info);

  row.append(identity);

  const lang = el("span", `tournament-bot-language ${safeLanguage(entry.snapshotLanguage)}`);
  lang.textContent = entry.snapshotLanguage || "—";
  row.append(lang);

  // Host can remove participants while the tournament is still a draft.
  if (isHost() && tournament.status === "draft") {
    const remove = el("button", "btn btn-secondary btn-small");
    remove.type = "button";
    remove.textContent = "Xóa";
    remove.addEventListener("click", () =>
      confirmAction(
        "Xóa người tham gia",
        `Xóa ${entry.user?.username || "người chơi này"} khỏi giải đấu?`,
        async () => {
          await window.api.request(`/tournaments/${tournament.id}/participants`, {
            method: "DELETE",
            body: JSON.stringify({ entryId: entry.id }),
          });
          showMessage("Đã xóa người tham gia.", "success");
          await loadDetail(true);
        }
      )
    );
    row.append(remove);
  }

  return row;
}

function buildScheduleSection(tournament) {
  const section = el("section", "content-card tournament-section");
  const heading = el("div", "tournament-section-heading");
  const h2 = el("h2");
  h2.innerHTML = '<span class="section-title-icon" aria-hidden="true">🗓️</span> Lịch thi đấu';
  const note = el("p");
  note.textContent = "Mỗi cặp thi đấu hai lượt đổi bên.";
  heading.append(h2, note);
  section.append(heading);

  const entryName = (id) => {
    const entry = tournament.entries.find((e) => e.id === id);
    return entry?.user?.username || `#${id}`;
  };

  tournament.rounds.forEach((round) => {
    const roundEl = el("div", "tournament-round");
    const roundHead = el("div", "tournament-round-head");
    const roundTitle = el("strong");
    roundTitle.textContent = `Vòng ${round.roundNumber}`;
    const roundStatus = el("span", `tournament-status-badge ${roundStatusClass(round.status)}`);
    roundStatus.textContent = roundStatusLabel(round.status);
    roundHead.append(roundTitle, roundStatus);
    roundEl.append(roundHead);

    const matchesEl = el("div", "tournament-round-matches");
    round.matches.forEach((match) => {
      const nameA = entryName(match.entryAId);
      const nameB = entryName(match.entryBId);
      const matchEl = el("div", "tournament-match");

      const versus = el("div", "tournament-match-versus");
      versus.append(
        document.createTextNode(nameA),
        el("span", "vs", "vs"),
        document.createTextNode(nameB)
      );
      matchEl.append(versus);

      const legs = el("div", "tournament-legs");
      match.games.forEach((game) => legs.append(buildLeg(game, match, nameA, nameB)));
      matchEl.append(legs);
      matchesEl.append(matchEl);
    });

    roundEl.append(matchesEl);
    section.append(roundEl);
  });

  return section;
}

function buildLeg(game, match, nameA, nameB) {
  const leg = el("div", "tournament-leg");
  const head = el("div", "tournament-leg-head");

  const legLabel = el("span");
  legLabel.textContent = `Lượt ${game.legNumber}`;
  head.append(legLabel);

  const status = el("span", `tournament-status-badge ${gameStatusClass(game.status)}`);
  status.textContent = gameStatusLabel(game.status, game.attempts);
  head.append(status);
  leg.append(head);

  const { text, cls } = describeLeg(game, match, nameA, nameB);
  const result = el("div", `tournament-leg-result ${cls}`);
  result.textContent = text;
  leg.append(result);
  return leg;
}

function describeLeg(game, match, nameA, nameB) {
  if (game.status === "pending") {
    return { text: "Chưa thi đấu", cls: "pending" };
  }
  if (game.status === "running") {
    return { text: "Đang diễn ra...", cls: "running" };
  }
  if (game.status === "failed") {
    return { text: `Lỗi${game.errorCode ? ` (${game.errorCode})` : ""} — cần xử lý`, cls: "failed" };
  }
  if (game.isDraw || !game.winnerEntryId) {
    return { text: "Hòa", cls: "draw" };
  }
  const winnerIsA = game.winnerEntryId === match.entryAId;
  return { text: `Thắng: ${winnerIsA ? nameA : nameB}`, cls: "win" };
}

function buildStandingsSection(tournament) {
  const section = el("section", "content-card tournament-section");
  const heading = el("div", "tournament-section-heading");
  const h2 = el("h2");
  h2.innerHTML = '<span class="section-title-icon" aria-hidden="true">🏆</span> Bảng xếp hạng';
  const note = el("p");
  note.textContent = "Thắng 3 điểm · Hòa 1 điểm · Thua 0 điểm.";
  heading.append(h2, note);
  section.append(heading);

  const wrapper = el("div", "tournament-standings-wrapper");
  const table = el("table", "tournament-standings-table");

  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  ["Hạng", "Người chơi", "Bot", "Trận", "T", "H", "B", "Điểm"].forEach((label) => {
    const th = document.createElement("th");
    th.textContent = label;
    headerRow.append(th);
  });
  thead.append(headerRow);
  table.append(thead);

  const tbody = document.createElement("tbody");
  tournament.standings.forEach((row, index) => {
    const tr = document.createElement("tr");
    if (index === 0) tr.className = "is-top";

    const rank = el("td", "rank-cell");
    rank.textContent = String(row.rank);
    const player = el("td");
    player.textContent = row.username || `#${row.userId}`;
    const bot = el("td");
    bot.textContent = row.botName || "—";
    const played = el("td");
    played.textContent = String(row.gamesPlayed);
    const wins = el("td");
    wins.textContent = String(row.wins);
    const draws = el("td");
    draws.textContent = String(row.draws);
    const losses = el("td");
    losses.textContent = String(row.losses);
    const points = el("td", "points-cell");
    points.textContent = String(row.points);

    tr.append(rank, player, bot, played, wins, draws, losses, points);
    tbody.append(tr);
  });
  table.append(tbody);
  wrapper.append(table);
  section.append(wrapper);
  return section;
}

// ---------- Shared helpers ----------

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function makeMeta(label, value) {
  const span = el("span");
  const strong = el("strong");
  strong.textContent = `${label}: `;
  span.append(strong, document.createTextNode(value));
  return span;
}

function safeStatus(value) {
  return Object.prototype.hasOwnProperty.call(STATUS_LABELS, value) ? value : "draft";
}

function safeLanguage(value) {
  return ["javascript", "python", "cpp"].includes(value) ? value : "javascript";
}

function gameStatusClass(status) {
  if (status === "completed") return "completed";
  if (status === "running") return "running";
  if (status === "failed") return "cancelled";
  return "draft";
}

function gameStatusLabel(status, attempts) {
  if (status === "completed") return "Xong";
  if (status === "running") return "Đang chạy";
  if (status === "failed") return "Lỗi";
  if (attempts > 0) return `Chờ chạy lại (${attempts})`;
  return "Chờ";
}

function roundStatusClass(status) {
  if (status === "completed") return "completed";
  if (status === "running") return "running";
  return "draft";
}

function roundStatusLabel(status) {
  if (status === "completed") return "Đã xong";
  if (status === "running") return "Đang chạy";
  return "Chờ";
}

function actionButton(label, className, onClick) {
  const button = el("button", className);
  button.type = "button";
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}

function confirmAction(title, message, onConfirm) {
  const dialog = document.getElementById("confirmDialog");
  document.getElementById("confirmTitle").textContent = title;
  document.getElementById("confirmMessage").textContent = message;
  const okBtn = document.getElementById("confirmOkBtn");
  // Replace the handler so each confirmation binds only its own action.
  const freshBtn = okBtn.cloneNode(true);
  okBtn.replaceWith(freshBtn);
  freshBtn.addEventListener("click", async () => {
    dialog.close();
    await onConfirm();
  });
  dialog.showModal();
}

async function postAction(url, successMessage) {
  try {
    await window.api.post(url);
    showMessage(successMessage, "success");
    await loadDetail(true);
  } catch (error) {
    showMessage(error.message || "Thao tác thất bại.", "error");
  }
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



