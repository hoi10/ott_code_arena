const isLocalPreview =
  ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname) &&
  window.location.port !== "3000";
const API_BASE_URL = isLocalPreview
  ? `${window.location.protocol}//${window.location.hostname}:3000/api`
  : "/api";

const api = {
  async request(endpoint, options = {}) {
    const token = localStorage.getItem("token");

    const headers = {
      "Content-Type": "application/json",
      ...options.headers,
    };

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const config = {
      ...options,
      headers,
      cache: options.cache ?? "no-store",
    };

    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, config);

      const contentType = response.headers.get("content-type");
      const isJson = contentType && contentType.includes("application/json");

      const data = isJson ? await response.json() : null;

      if (response.status === 401) {
        localStorage.removeItem("token");
        localStorage.removeItem("user");

        if (
          !window.location.pathname.endsWith("/login.html") &&
          !window.location.pathname.endsWith("/register.html")
        ) {
          window.location.href = "/login.html";
        }

        throw new Error(data?.message || "Phiên đăng nhập đã hết hạn.");
      }

      if (!response.ok) {
        const error = new Error(
          data?.message || `Yêu cầu không thành công (${response.status}).`
        );
        error.status = response.status;
        error.code = data?.code;
        throw error;
      }

      return data;
    } catch (error) {
      if (error instanceof TypeError) {
        throw new Error(
          "Không thể kết nối đến máy chủ. Vui lòng thử lại sau."
        );
      }

      throw error;
    }
  },

  get(endpoint) {
    return this.request(endpoint, {
      method: "GET",
    });
  },

  post(endpoint, body = {}) {
    return this.request(endpoint, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },

  put(endpoint, body = {}) {
    return this.request(endpoint, {
      method: "PUT",
      body: JSON.stringify(body),
    });
  },

  patch(endpoint, body = {}) {
    return this.request(endpoint, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  },

  delete(endpoint) {
    return this.request(endpoint, {
      method: "DELETE",
    });
  },
};

window.api = api;