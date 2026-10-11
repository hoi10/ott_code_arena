document.addEventListener("DOMContentLoaded", () => {
  const passwordInput = document.getElementById("password");
  const confirmPasswordInput = document.getElementById("confirmPassword");

  const togglePassword = document.getElementById("togglePassword");
  const toggleConfirmPassword = document.getElementById(
    "toggleConfirmPassword"
  );

  const strengthContainer = document.getElementById("passwordStrength");
  const strengthLabel = document.getElementById("strengthLabel");

  const strengthBars = strengthContainer?.querySelectorAll(
    ".strength-bars span"
  );

  // Show / hide password.
  function setupPasswordToggle(button, input) {
    if (!button || !input) return;

    button.addEventListener("click", () => {
      const isPassword = input.type === "password";

      input.type = isPassword ? "text" : "password";
      button.textContent = isPassword ? "Ẩn" : "Hiện";

      button.setAttribute(
        "aria-label",
        isPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"
      );
    });
  }

  setupPasswordToggle(togglePassword, passwordInput);
  setupPasswordToggle(toggleConfirmPassword, confirmPasswordInput);

  // Password strength indicator.
  passwordInput?.addEventListener("input", () => {
    const password = passwordInput.value;
    let score = 0;

    if (password.length >= 8) score++;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
    if (/\d/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;

    const labels = [
      "Rất yếu",
      "Yếu",
      "Trung bình",
      "Tốt",
      "Rất tốt"
    ];

    if (strengthLabel) {
      strengthLabel.textContent = password
        ? labels[score]
        : "Độ mạnh mật khẩu";
    }

    strengthBars?.forEach((bar, index) => {
      bar.className =
        password && index < score
          ? `strength-${score}`
          : "";
    });
  });

  // Placeholder links.
  ["termsLink", "privacyLink"].forEach((id) => {
    document.getElementById(id)?.addEventListener("click", (event) => {
      event.preventDefault();

      const message = document.getElementById("authMessage");

      if (!message) return;

      message.textContent =
        "Tính năng này hiện chưa được triển khai. Vui lòng quay lại sau.";

      message.className = "auth-message info";
      message.hidden = false;
    });
  });
});