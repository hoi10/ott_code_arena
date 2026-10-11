document.addEventListener("DOMContentLoaded", () => {
  const loginForm = document.getElementById("loginForm");
  const registerForm = document.getElementById("registerForm");

  if (loginForm) {
    initializeLoginPage(loginForm);
    loginForm.addEventListener("submit", handleLogin);
  }

  if (registerForm) {
    registerForm.addEventListener("submit", handleRegister);
  }

  // Nếu đã đăng nhập, chuyển đến dashboard
  const token = localStorage.getItem("token");
  const isAuthPage =
    window.location.pathname.endsWith("/login.html") ||
    window.location.pathname.endsWith("/register.html");

  if (token && isAuthPage) {
    window.location.href = "/dashboard.html";
  }
});

function initializeLoginPage(loginForm) {
  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");
  const rememberMe = document.getElementById("rememberMe");
  const togglePassword = document.getElementById("togglePassword");
  const forgotPasswordLink = document.getElementById("forgotPasswordLink");

  togglePassword?.addEventListener("click", () => {
    const isPassword = passwordInput.type === "password";
    passwordInput.type = isPassword ? "text" : "password";
    togglePassword.textContent = isPassword ? "Ẩn" : "Hiện";
    togglePassword.setAttribute(
      "aria-label",
      isPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"
    );
  });

  const savedEmail = localStorage.getItem("rememberedEmail");
  if (savedEmail) {
    emailInput.value = savedEmail;
    rememberMe.checked = true;
  }

  loginForm.addEventListener("submit", () => {
    if (rememberMe.checked) {
      localStorage.setItem("rememberedEmail", emailInput.value.trim());
    } else {
      localStorage.removeItem("rememberedEmail");
    }
  });

  forgotPasswordLink?.addEventListener("click", (event) => {
    event.preventDefault();
    showMessage(
      "Tính năng khôi phục mật khẩu hiện chưa được triển khai.",
      "info"
    );
  });
}

// ==================== LOGIN ====================

async function handleLogin(event) {
  event.preventDefault();

  const form = event.currentTarget;
  const submitButton = form.querySelector('[type="submit"]');
  const email = form.querySelector('[name="email"]')?.value.trim();
  const password = form.querySelector('[name="password"]')?.value;

  if (!email || !password) {
    showMessage("Vui lòng nhập email và mật khẩu.", "error");
    return;
  }

  setLoading(submitButton, true);

  try {
    const response = await window.api.post("/auth/login", {
        email,
        password,
    });

    const data = response?.data ?? response;

    const token =
      data.token ??
      data.accessToken ??
      data.access_token;

    if (!token) {
      throw new Error("Máy chủ không trả về token đăng nhập.");
    }

    localStorage.setItem("token", token);

    if (data.user) {
      localStorage.setItem("user", JSON.stringify(data.user));
    }

    showMessage("Đăng nhập thành công!", "success");

    setTimeout(() => {
      window.location.href = "/dashboard.html";
    }, 500);
  } catch (error) {
    showMessage(error.message || "Đăng nhập thất bại.", "error");
  } finally {
    setLoading(submitButton, false);
  }
}

// ==================== REGISTER ====================

async function handleRegister(event) {
  event.preventDefault();

  const form = event.currentTarget;
  const submitButton = form.querySelector('[type="submit"]');

  const name = form.querySelector('[name="name"]')?.value.trim();
  const email = form.querySelector('[name="email"]')?.value.trim();
  const password = form.querySelector('[name="password"]')?.value;
  const confirmPassword = form.querySelector(
    '[name="confirmPassword"]'
  )?.value;

  const agreeTerms = document.getElementById("agreeTerms")?.checked;

  if (!name || !email || !password || !confirmPassword) {
    showMessage("Vui lòng điền đầy đủ thông tin.", "error");
    return;
  }

  if (name.length < 2 || name.length > 50) {
    showMessage("Tên hiển thị phải có từ 2 đến 50 ký tự.", "error");
    return;
  }

  if (!isValidEmail(email)) {
    showMessage("Địa chỉ email không hợp lệ.", "error");
    return;
  }

  if (password.length < 8) {
    showMessage("Mật khẩu phải có ít nhất 8 ký tự.", "error");
    return;
  }

  if (password !== confirmPassword) {
    showMessage("Mật khẩu xác nhận không khớp.", "error");
    return;
  }

  if (!agreeTerms) {
    showMessage(
      "Vui lòng đồng ý với Điều khoản dịch vụ và Chính sách quyền riêng tư.",
      "error"
    );
    return;
  }

  setLoading(submitButton, true);

  try {
    await window.api.post("/auth/register", {
        username: name,
        email,
        password,
    });

    showMessage(
      "Đăng ký thành công! Đang chuyển đến đăng nhập.",
      "success"
    );

    setTimeout(() => {
      window.location.href = "/login.html";
    }, 1000);
  } catch (error) {
    showMessage(error.message || "Đăng ký thất bại.", "error");
  } finally {
    setLoading(submitButton, false);
  }
}

// ==================== HELPERS ====================

function showMessage(message, type = "info") {
  let messageElement = document.getElementById("authMessage");

  if (!messageElement) {
    messageElement = document.createElement("div");
    messageElement.id = "authMessage";
    messageElement.setAttribute("role", "status");
    messageElement.setAttribute("aria-live", "polite");

    const form =
      document.getElementById("loginForm") ||
      document.getElementById("registerForm");

    if (form) {
      form.prepend(messageElement);
    } else {
      document.body.prepend(messageElement);
    }
  }

  messageElement.textContent = message;
  messageElement.className = `auth-message ${type}`;
  messageElement.hidden = false;
  messageElement.style.display = "block";
}

function setLoading(button, isLoading) {
  if (!button) return;

  if (isLoading) {
    button.dataset.originalText = button.textContent;
    button.disabled = true;
    button.textContent = "Đang xử lý...";
    button.classList.add("loading");
  } else {
    button.disabled = false;
    button.textContent =
      button.dataset.originalText || "Xác nhận";
    button.classList.remove("loading");
  }
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}