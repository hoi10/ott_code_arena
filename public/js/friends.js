"use strict";

document.addEventListener("DOMContentLoaded", initializeFriendsPage);

async function initializeFriendsPage() {
  if (!localStorage.getItem("token")) {
    window.location.replace("/login.html");
    return;
  }
  document
    .getElementById("friendSearchForm")
    .addEventListener("submit", searchFriends);
  await loadFriendsPage();
  window.setInterval(() => void loadFriendsPage(), 8_000);
}

async function loadFriendsPage() {
  try {
    const response = await window.api.get("/friends");
    const { friends, requests } = response?.data ?? {};
    if (!Array.isArray(friends) || !requests) {
      throw new Error("Máy chủ trả về dữ liệu bạn bè không hợp lệ.");
    }
    renderFriends(friends);
    const incoming = requests.incoming ?? [];
    renderRequests("incomingFriendRequests", incoming, true);
    renderRequests("outgoingFriendRequests", requests.outgoing ?? [], false);
    document.getElementById("friendCount").textContent = String(friends.length);
    document.getElementById("onlineFriendCount").textContent = String(
      friends.filter((friend) => friend.online).length
    );
    document.getElementById("pendingFriendCount").textContent = String(incoming.length);
    document.getElementById("incomingRequestCount").textContent = String(incoming.length);
  } catch (error) {
    showFriendsMessage(error.message, "error");
  }
}

async function searchFriends(event) {
  event.preventDefault();
  const query = document.getElementById("friendSearchInput").value.trim();
  if (!query) return;
  try {
    const response = await window.api.get(
      `/friends/search?query=${encodeURIComponent(query)}`
    );
    renderSearchResults(response?.data?.users ?? []);
  } catch (error) {
    showFriendsMessage(error.message, "error");
  }
}

function renderFriends(friends) {
  const container = document.getElementById("friendList");
  container.replaceChildren();
  if (!friends.length) {
    showEmpty(container, "Bạn chưa có bạn bè nào.");
    return;
  }
  for (const friend of friends) {
    const row = createRow(friend.username, friend.online ? "Đang trực tuyến" : "Ngoại tuyến", friend.online);
    const actions = document.createElement("div");
    actions.className = "friend-actions";
    if (friend.online) {
      actions.append(makeButton("Mời thi đấu", "btn btn-primary", async () => {
        try {
          await window.api.post(`/friends/${friend.id}/challenges`);
          showFriendsMessage(
            `Đã gửi lời mời thi đấu cho ${friend.username}. Lời mời có hiệu lực trong 10 giây.`
          );
        } catch (error) {
          showFriendsMessage(error.message, "error");
        }
      }));
    }
    actions.append(makeButton("Xóa bạn", "btn btn-secondary", async () => {
      if (!window.confirm(`Bạn muốn xóa ${friend.username} khỏi danh sách bạn bè?`)) return;
      try {
        await window.api.delete(`/friends/${friend.id}`);
        await loadFriendsPage();
        showFriendsMessage(`Đã xóa ${friend.username} khỏi danh sách bạn bè.`);
      } catch (error) {
        showFriendsMessage(error.message, "error");
      }
    }));
    row.append(actions);
    container.append(row);
  }
}

function renderSearchResults(users) {
  const container = document.getElementById("friendSearchResults");
  container.replaceChildren();
  if (!users.length) {
    showEmpty(container, "Không tìm thấy người dùng phù hợp.");
    return;
  }
  for (const user of users) {
    const row = createRow(user.username, user.online ? "Đang trực tuyến" : "Ngoại tuyến", user.online);
    row.append(makeButton("Kết bạn", "btn btn-primary", async () => {
      try {
        await window.api.post("/friends/requests", { username: user.username });
        showFriendsMessage(`Đã gửi lời mời kết bạn đến ${user.username}.`);
        await loadFriendsPage();
      } catch (error) {
        showFriendsMessage(error.message, "error");
      }
    }));
    container.append(row);
  }
}

function renderRequests(containerId, requests, incoming) {
  const container = document.getElementById(containerId);
  container.replaceChildren();
  if (!requests.length) {
    showEmpty(container, incoming ? "Không có lời mời mới." : "Chưa gửi lời mời nào.");
    return;
  }
  for (const request of requests) {
    const row = createRow(request.user.username, incoming ? "Muốn kết bạn với bạn" : "Đang chờ phản hồi", false);
    if (incoming) {
      const actions = document.createElement("div");
      actions.className = "friend-actions";
      actions.append(makeButton("Chấp nhận", "btn btn-primary", () => respondToFriendRequest(request.id, true)));
      actions.append(makeButton("Từ chối", "btn btn-secondary", () => respondToFriendRequest(request.id, false)));
      row.append(actions);
    }
    container.append(row);
  }
}

async function respondToFriendRequest(requestId, accept) {
  try {
    await window.api.post(`/friends/requests/${requestId}/respond`, { accept });
    await loadFriendsPage();
    showFriendsMessage(accept ? "Đã chấp nhận lời mời kết bạn." : "Đã từ chối lời mời kết bạn.");
  } catch (error) {
    showFriendsMessage(error.message, "error");
  }
}

function createRow(username, status, online) {
  const row = document.createElement("article");
  row.className = "friend-row";
  const user = document.createElement("div");
  user.className = "friend-user";
  const avatar = document.createElement("span");
  avatar.className = "friend-avatar";
  avatar.setAttribute("aria-hidden", "true");
  avatar.textContent = username.trim().charAt(0) || "?";
  const name = document.createElement("strong");
  name.textContent = username;
  const state = document.createElement("span");
  state.className = `friend-status${online ? " online" : ""}`;
  state.textContent = status;
  const details = document.createElement("span");
  details.append(name, state);
  user.append(avatar, details);
  row.append(user);
  return row;
}

function makeButton(label, className, action) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = label;
  button.addEventListener("click", action);
  return button;
}

function showEmpty(container, message) {
  const empty = document.createElement("p");
  empty.className = "friend-list-empty";
  empty.textContent = message;
  container.append(empty);
}

function showFriendsMessage(message, type = "info") {
  if (typeof window.showSocialToast === "function") {
    window.showSocialToast(message, type === "error");
    return;
  }
  console.error("Không thể hiển thị thông báo bạn bè:", message);
}
