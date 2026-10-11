document.addEventListener("DOMContentLoaded", () => {
  checkAuthentication();
  initializeDashboard();
});

function initializeProfileButton() {
  const profileButton = document.getElementById("topbarAvatarButton");

  if (!profileButton) return;

  profileButton.addEventListener("click", () => {
    window.location.href = "/profile.html";
  });
}

// ==================== AUTHENTICATION ====================

function checkAuthentication() {
  const token = localStorage.getItem("token");

  if (!token) {
    window.location.href = "/login.html";
  }
}

function getCurrentUser() {
  try {
    return JSON.parse(localStorage.getItem("user")) || {};
  } catch {
    return {};
  }
}

// ==================== INITIALIZE DASHBOARD ====================

async function initializeDashboard() {
  initializeProfileButton();
  displayUserInfo();
  initializeNavigation();
  initializeLogout();
  initializeMobileMenu();
  initializeCreateBotButton();
  initializeBotRetry();

  await loadDashboardData();
}

function displayUserInfo() {
  const user = getCurrentUser();

  const name =
    user.name ||
    user.username ||
    user.email?.split("@")[0] ||
    "Người chơi";

  const elements = [
    document.getElementById("userName"),
    document.getElementById("welcomeName"),
    document.getElementById("profileName"),
    document.getElementById("topbarAvatar"),
  ];

  elements.forEach((element) => {
    if (element) {
      element.textContent =
        element.id === "topbarAvatar"
          ? name.trim().charAt(0).toUpperCase() || "N"
          : name;
    }
  });

  const emailElement = document.getElementById("userEmail");

  if (emailElement) {
    emailElement.textContent = user.email || "";
  }

  const avatarElement = document.getElementById("userAvatar");

  if (avatarElement) {
    avatarElement.textContent = name.trim().charAt(0).toUpperCase() || "N";
  }
}

// ==================== LOAD DASHBOARD DATA ====================

async function loadDashboardData() {
  await Promise.allSettled([
    loadUserProfile(),
    loadBots(),
    loadMatches(),
    loadSubmissions(),
  ]);
}

// ==================== USER PROFILE ====================

async function loadUserProfile() {
  try {
    const [profileResponse, statsResponse] = await Promise.all([
      api.get("/users/profile"),
      api.get("/users/stats"),
    ]);
    const user = profileResponse?.data?.user;
    const stats = statsResponse?.data?.stats;

    if (!user || typeof user !== "object" || !stats) return;

    localStorage.setItem("user", JSON.stringify(user));
    displayUserInfo();

    setText("totalBots", stats.totalBots ?? "—");
    setText("totalMatches", stats.totalMatches ?? "—");
    setText("totalWins", stats.totalWins ?? "—");
    const winRate = stats.totalMatches
      ? (stats.totalWins / stats.totalMatches) * 100
      : 0;
    setText("winRate", formatWinRate(winRate));
  } catch (error) {
    console.error("Không thể tải thông tin người dùng:", error.message);
  }
}

// ==================== BOTS ====================

async function loadBots() {
  const container = document.getElementById("botsList");
  const countElement = document.getElementById("totalBots");

  try {
    renderBotLoadingState(container);
    const response = await api.get("/bots");
    const result = response?.data ?? response;

    const bots = Array.isArray(result)
      ? result
      : result.bots ?? result.items ?? [];

    if (countElement) {
      countElement.textContent = bots.length;
    }

    if (!container) return;

    if (bots.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">🤖</div>
          <h3>Chưa có bot nào</h3>
          <p>Tạo bot đầu tiên và bắt đầu thử thách!</p>
          <button class="btn btn-primary" id="emptyCreateBotBtn">
            + Tạo bot mới
          </button>
        </div>
      `;

      document
        .getElementById("emptyCreateBotBtn")
        ?.addEventListener("click", openCreateBotDialog);

      return;
    }

    container.replaceChildren();

    bots.forEach((bot) => {
      container.appendChild(createBotCard(bot));
    });
  } catch (error) {
    console.error("Không thể tải danh sách bot:", error.message);

    if (container) {
      const emptyState = document.createElement("div");
      emptyState.className = "empty-state";

      const message = document.createElement("p");
      message.textContent = `Không thể tải danh sách bot: ${error.message}`;

      const retryButton = document.createElement("button");
      retryButton.className = "btn btn-secondary";
      retryButton.id = "retryBotsBtn";
      retryButton.type = "button";
      retryButton.textContent = "Thử lại";

      emptyState.append(message, retryButton);
      container.replaceChildren(emptyState);
    }
  }
}

function initializeBotRetry() {
  const container = document.getElementById("botsList");
  if (!container) return;

  container.addEventListener("click", (event) => {
    if (event.target.closest("#retryBotsBtn")) {
      loadBots();
    }
  });
}

function renderBotLoadingState(container) {
  if (!container) return;

  const loading = document.createElement("div");
  loading.className = "loading-state";

  const spinner = document.createElement("div");
  spinner.className = "loading-spinner";

  const message = document.createElement("p");
  message.textContent = "Đang tải danh sách bot...";

  loading.append(spinner, message);
  container.replaceChildren(loading);
}

function createBotCard(bot) {
  const card = document.createElement("article");
  card.className = "bot-card";

  const icon = document.createElement("div");
  icon.className = "bot-card-icon";
  icon.textContent = "🤖";

  const title = document.createElement("h3");
  title.className = "bot-card-title";
  title.textContent = bot.name || "Bot chưa đặt tên";

  const description = document.createElement("p");
  description.className = "bot-card-description";
  description.textContent = bot.description || "Chưa có mô tả.";

  const status = document.createElement("span");
  status.className = "bot-status";
  status.textContent = bot.isActive === false ? "Đã tắt" : "Đang hoạt động";

  const actions = document.createElement("div");
  actions.className = "bot-card-actions";

  const viewButton = document.createElement("button");
  viewButton.className = "btn btn-secondary";
  viewButton.textContent = "Chi tiết";

  viewButton.addEventListener("click", () => {
    window.location.href =
      `/bots.html?id=${encodeURIComponent(bot.id)}#bot-${encodeURIComponent(bot.id)}`;
  });

  actions.append(viewButton);
  card.append(icon, title, description, status, actions);

  return card;
}

// ==================== MATCHES ====================

async function loadMatches() {
  const container = document.getElementById("matchesList");
  const countElement = document.getElementById("totalMatches");

  try {
    const response = await api.get("/matches");
    const result = response?.data ?? response;

    const matches = Array.isArray(result)
      ? result
      : result.matches ?? result.items ?? [];

    if (countElement) {
      countElement.textContent = matches.length;
    }

    if (!container) return;

    if (matches.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">🏆</div>
          <h3>Chưa có trận đấu</h3>
          <p>Các trận đấu của bạn sẽ xuất hiện tại đây.</p>
        </div>
      `;
      return;
    }

    container.replaceChildren();

    matches.slice(0, 5).forEach((match) => {
      container.appendChild(createMatchRow(match));
    });
  } catch (error) {
    console.error("Không thể tải trận đấu:", error.message);

    if (container) {
      container.innerHTML = `
        <div class="empty-state">
          <p>Không thể tải lịch sử trận đấu.</p>
        </div>
      `;
    }
  }
}

function createMatchRow(match) {
  const row = document.createElement("div");
  row.className = "match-row";

  const info = document.createElement("div");
  info.className = "match-info";

  const title = document.createElement("h4");
  title.textContent = match.name || `Trận đấu #${match.id}`;

  const date = document.createElement("p");
  date.textContent = formatDate(match.createdAt || match.created_at);

  const status = document.createElement("span");
  status.className = "match-status";
  status.textContent = formatMatchStatus(match.status);

  info.append(title, date);
  row.append(info, status);
  if (match.id) {
    row.tabIndex = 0;
    row.setAttribute("role", "link");
    row.setAttribute("aria-label", `Mở trận đấu ${match.id}`);
    row.addEventListener("click", () => {
      window.location.href = `/matches.html?id=${encodeURIComponent(match.id)}`;
    });
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        window.location.href =
          `/matches.html?id=${encodeURIComponent(match.id)}`;
      }
    });
  }

  return row;
}

// ==================== SUBMISSIONS ====================

async function loadSubmissions() {
  const container = document.getElementById("submissionsList");

  try {
    const response = await api.get("/submissions");
    const result = response?.data ?? response;

    const submissions = Array.isArray(result)
      ? result
      : result.submissions ?? result.items ?? [];

    if (!container) return;

    if (submissions.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📝</div>
          <h3>Chưa có lượt test bot</h3>
          <p>Kết quả kiểm thử bot sẽ xuất hiện tại đây.</p>
        </div>
      `;
      return;
    }

    container.replaceChildren();

    submissions.slice(0, 5).forEach((submission) => {
      const item = document.createElement("div");
      item.className = "submission-row";

      const title = document.createElement("span");
      title.textContent =
        submission.name ||
        submission.bot?.name ||
        `Lần test bot #${submission.id}`;

      const status = document.createElement("span");
      status.className = "submission-status";
      status.textContent = formatSubmissionStatus(submission.status);

      item.append(title, status);
      container.appendChild(item);
    });
  } catch (error) {
    console.error("Không thể tải lịch sử test bot:", error.message);

    if (container) {
      container.innerHTML = `
        <div class="empty-state">
          <p>Không thể tải lịch sử test bot.</p>
        </div>
      `;
    }
  }
}

// ==================== NAVIGATION ====================

function initializeNavigation() {
  const navLinks = document.querySelectorAll("[data-nav]");

  navLinks.forEach((link) => {
    const target = link.getAttribute("href");

    if (target && window.location.pathname.endsWith(target)) {
      link.classList.add("active");
    }
  });
}

// ==================== LOGOUT ====================

function initializeLogout() {
  document.querySelectorAll("#logoutBtn, [data-action='logout']").forEach(
    (button) => {
      button.addEventListener("click", logout);
    }
  );
}

function logout() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");

  window.location.href = "/login.html";
}

// ==================== MOBILE MENU ====================

function initializeMobileMenu() {
  const toggle = document.getElementById("menuToggle");
  const sidebar = document.getElementById("sidebar");
  const mainContent = document.querySelector(".dashboard-page .main-content");
  const overlay = document.getElementById("sidebarOverlay");

  if (!toggle || !sidebar || !mainContent || !overlay) return;

  const isMobileViewport = () => window.matchMedia("(max-width: 1000px)").matches;

  const closeMobileMenu = () => {
    sidebar.classList.remove("is-open");
    overlay.classList.remove("is-visible");
    toggle.setAttribute("aria-expanded", "false");
  };

  toggle.addEventListener("click", () => {
    if (!isMobileViewport()) {
      const isCollapsed = sidebar.classList.toggle("is-collapsed");
      mainContent.classList.toggle("sidebar-collapsed", isCollapsed);
      toggle.setAttribute("aria-expanded", String(!isCollapsed));
    } else {
      const isOpen = sidebar.classList.toggle("is-open");
      overlay.classList.toggle("is-visible", isOpen);
      toggle.setAttribute("aria-expanded", String(isOpen));
    }
  });

  overlay.addEventListener("click", closeMobileMenu);

  let wasMobileViewport = isMobileViewport();

  window.addEventListener("resize", () => {
    const isMobile = isMobileViewport();

    if (isMobile !== wasMobileViewport) {
      sidebar.classList.remove("is-collapsed");
      mainContent.classList.remove("sidebar-collapsed");
      closeMobileMenu();
      wasMobileViewport = isMobile;
    }
  });
}

// ==================== CREATE BOT ====================

function initializeCreateBotButton() {
  document
    .querySelectorAll(
      "#createBotBtn, #sidebarCreateBotBtn, [data-action='create-bot']"
    )
    .forEach((button) => {
      button.addEventListener("click", openCreateBotDialog);
    });

  document.getElementById("viewAllBotsBtn")?.addEventListener("click", () => {
    window.location.href = "/bots.html";
  });
}

function openCreateBotDialog() {
  window.location.href = "/create-bot.html";
}

// ==================== UTILITIES ====================

function setText(id, value) {
  const element = document.getElementById(id);

  if (element && value !== undefined && value !== null) {
    element.textContent = value;
  }
}

function formatWinRate(value) {
  if (value === undefined || value === null || value === "") {
    return "—";
  }

  const rate = Number(value);

  if (!Number.isFinite(rate)) {
    return "—";
  }

  return `${rate.toFixed(1)}%`;
}

function formatDate(value) {
  if (!value) return "Chưa có thời gian";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Không xác định";
  }

  return date.toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatMatchStatus(status) {
  return {
    pending: "Chờ bắt đầu",
    running: "Đang diễn ra",
    completed: "Đã kết thúc",
    cancelled: "Đã hủy",
  }[status] || "Chưa xác định";
}

function formatSubmissionStatus(status) {
  return {
    accepted: "Nước đi hợp lệ",
    rejected: "Nước đi chưa hợp lệ",
    failed: "Bot gặp lỗi",
    pending: "Đang chờ",
  }[status] || "Chưa xác định";
}