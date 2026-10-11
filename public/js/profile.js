document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("profileForm");
  form?.addEventListener("submit", updateProfile);
  renderProfileUser(getCachedUser());
  loadProfile();
});

async function loadProfile() {
  try {
    const profileResponse = await window.api.get("/users/profile");
    const user = profileResponse?.data?.user;
    if (!user || typeof user !== "object") {
      throw new Error("Máy chủ không trả về dữ liệu hồ sơ.");
    }

    localStorage.setItem("user", JSON.stringify(user));
    renderProfileUser(user);
  } catch (error) {
    showAccountMessage("profileMessage", `Không thể tải hồ sơ: ${error.message}`, "error");
  }

  try {
    const statsResponse = await window.api.get("/users/stats");
    const stats = statsResponse?.data?.stats;
    if (!stats || typeof stats !== "object") {
      throw new Error("Máy chủ không trả về thống kê hoạt động.");
    }

    setProfileStat("profileBotCount", stats.totalBots);
    setProfileStat("profileMatchCount", stats.totalMatches);
    setProfileStat("profileWinCount", stats.totalWins);
    setProfileStat("profileSubmissionCount", stats.totalSubmissions);
  } catch (error) {
    showAccountMessage("profileMessage", `Không thể tải thống kê: ${error.message}`, "error");
  }
}

async function updateProfile(event) {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;

  const button = form.querySelector('[type="submit"]');
  const username = document.getElementById("profileUsername").value.trim();
  button.disabled = true;
  button.textContent = "Đang lưu...";

  try {
    const response = await window.api.patch("/users/profile", { username });
    const user = response?.data?.user;
    if (!user) throw new Error("Máy chủ không trả về hồ sơ đã cập nhật.");
    localStorage.setItem("user", JSON.stringify(user));
    renderProfileUser(user);
    showAccountMessage("profileMessage", "Đã cập nhật hồ sơ.", "success");
  } catch (error) {
    showAccountMessage("profileMessage", `Không thể lưu hồ sơ: ${error.message}`, "error");
  } finally {
    button.disabled = false;
    button.textContent = "Lưu hồ sơ";
  }
}

function getCachedUser() {
  try {
    return JSON.parse(localStorage.getItem("user") || "{}");
  } catch {
    return {};
  }
}

function renderProfileUser(user) {
  const username = user.username?.trim() || "";
  const displayName = username || user.name?.trim() || "Người chơi";

  document.getElementById("profileDisplayName").textContent = displayName;
  document.getElementById("profileAvatar").textContent =
    displayName.charAt(0).toLocaleUpperCase("vi-VN");
  document.getElementById("profileUsername").value = username;
  document.getElementById("profileEmailInput").value = user.email || "";
  document.getElementById("profileEmail").textContent = user.email || "";
  document.getElementById("profileJoined").textContent = user.createdAt
    ? `Tham gia ${formatProfileDate(user.createdAt)}`
    : "";
}

function setProfileStat(id, value) {
  document.getElementById(id).textContent = Number.isFinite(Number(value))
    ? Number(value).toLocaleString("vi-VN")
    : "—";
}

function formatProfileDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "ngày không xác định";
  return new Intl.DateTimeFormat("vi-VN", { dateStyle: "long" }).format(date);
}

function showAccountMessage(id, message, type) {
  const element = document.getElementById(id);
  element.textContent = message;
  element.className = `account-message ${type}`;
  element.hidden = false;
}
