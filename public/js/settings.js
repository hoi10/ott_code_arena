document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("passwordForm")?.addEventListener("submit", updatePassword);
  document.getElementById("settingsLogoutBtn")?.addEventListener("click", () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    window.location.assign("/login.html");
  });
});

async function updatePassword(event) {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;

  const currentPassword = form.elements.currentPassword.value;
  const newPassword = form.elements.newPassword.value;
  const confirmPassword = form.elements.confirmPassword.value;
  if (newPassword !== confirmPassword) {
    showAccountMessage("settingsMessage", "Mật khẩu xác nhận không khớp.", "error");
    return;
  }

  const button = form.querySelector('[type="submit"]');
  button.disabled = true;
  button.textContent = "Đang cập nhật...";
  try {
    await window.api.patch("/users/password", { currentPassword, newPassword });
    form.reset();
    showAccountMessage("settingsMessage", "Đã đổi mật khẩu thành công.", "success");
  } catch (error) {
    showAccountMessage("settingsMessage", `Không thể đổi mật khẩu: ${error.message}`, "error");
  } finally {
    button.disabled = false;
    button.textContent = "Cập nhật mật khẩu";
  }
}

function showAccountMessage(id, message, type) {
  const element = document.getElementById(id);
  element.textContent = message;
  element.className = `account-message ${type}`;
  element.hidden = false;
}
