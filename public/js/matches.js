"use strict";

const roomPage = {
  room: null,
  bots: [],
  roomId: null,
  access: null,
  pollingTimer: null,
  presenceTimer: null,
  listTimer: null,
  activePlayerRoom: null,
  loadingRoom: false,
  botSelectionDirty: false,
  selectedBotId: "",
  roomFriendsLoadedAt: 0,
  challengeInvitationId: null,
  botsLoaded: false,
};

document.addEventListener("DOMContentLoaded", initializeRoomsPage);

async function initializeRoomsPage() {
  document.querySelectorAll("[data-room-view]").forEach((button) => {
    button.addEventListener("click", () => void showRoomView(button.dataset.roomView));
  });
  document
    .getElementById("createRoomForm")
    .addEventListener("submit", createRoom);
  document
    .getElementById("searchRoomForm")
    .addEventListener("submit", searchRooms);
  document
    .getElementById("roomAccessForm")
    .addEventListener("submit", submitRoomAccess);
  document
    .getElementById("cancelRoomAccess")
    .addEventListener("click", () => {
      roomPage.access = null;
      closeRoomAccessDialog();
    });
  document.getElementById("closeRoomAccessDialog").addEventListener("click", closeRoomAccessDialog);
  document.getElementById("cancelSpectatorAccess").addEventListener("click", closeRoomAccessDialog);
  document.getElementById("roomAccessDialog").addEventListener("cancel", (event) => {
    event.preventDefault();
    closeRoomAccessDialog();
  });
  document
    .getElementById("spectatorPasswordForm")
    .addEventListener("submit", enterAsSpectator);
  document
    .getElementById("readyBtn")
    .addEventListener("click", toggleReady);
  document.getElementById("roomBotSelect").addEventListener("change", (event) => {
    roomPage.selectedBotId = event.currentTarget.value;
    roomPage.botSelectionDirty = true;
  });
  document
    .getElementById("startRoomBtn")
    .addEventListener("click", startRoom);
  document
    .getElementById("pauseMatchBtn")
    .addEventListener("click", pauseMatch);
  document
    .getElementById("resumeMatchBtn")
    .addEventListener("click", resumeMatch);
  document
    .getElementById("changeRoomBotBtn")
    .addEventListener("click", changeRoomBot);
  document
    .getElementById("waitingLeaveRoomBtn")
    .addEventListener("click", () => leaveRoom("waitingLeaveRoomBtn"));
  document
    .getElementById("resultLeaveRoomBtn")
    .addEventListener("click", () => leaveRoom("resultLeaveRoomBtn"));
  document
    .getElementById("waitingDissolveRoomBtn")
    .addEventListener("click", () => dissolveRoom("waitingDissolveRoomBtn"));
  document
    .getElementById("resultDissolveRoomBtn")
    .addEventListener("click", () => dissolveRoom("resultDissolveRoomBtn"));
  document
    .getElementById("requestRematchBtn")
    .addEventListener("click", requestRematch);
  document
    .getElementById("acceptRematchBtn")
    .addEventListener("click", () => respondRematch(true));
  document
    .getElementById("declineRematchBtn")
    .addEventListener("click", () => respondRematch(false));
  document
    .getElementById("copyRoomPasswordBtn")
    .addEventListener("click", copyRoomPassword);
  document
    .getElementById("matchResultDialog")
    .addEventListener("cancel", (event) => event.preventDefault());

  const isAuthenticated = Boolean(localStorage.getItem("token"));
  document.getElementById("myRoomsCard").hidden = !isAuthenticated;

  if (isAuthenticated) {
    await loadAvailableBots();
  }
  const challengeId = new URLSearchParams(window.location.search).get("createChallenge");
  if (challengeId && /^\d+$/.test(challengeId)) {
    roomPage.challengeInvitationId = challengeId;
    document.getElementById("challengeInvitationId").value = challengeId;
  }

  roomPage.roomId = new URLSearchParams(window.location.search).get("id");
  if (roomPage.roomId) {
    document.getElementById("roomsHomePanel").hidden = true;
    document.getElementById("roomsHomeLists").hidden = true;
    const viewerToken = sessionStorage.getItem(viewerTokenKey(roomPage.roomId));
    if (viewerToken) {
      await loadRoom(roomPage.roomId, viewerToken);
    } else if (!isAuthenticated) {
      showSpectatorPasswordForm();
    } else {
      await loadRoom(roomPage.roomId);
    }
    roomPage.pollingTimer = window.setInterval(pollRoom, 1_200);
    roomPage.presenceTimer = window.setInterval(sendRoomHeartbeat, 1_500);
  }

  if (isAuthenticated) await loadMyRooms();
  if (roomPage.challengeInvitationId && isAuthenticated && !roomPage.roomId) {
    if (!roomPage.botsLoaded) {
      showSocialToast(
        "Không thể tải danh sách bot nên chưa thể tiếp tục lời mời thi đấu.",
        true
      );
      await showRoomView("home");
    } else if (roomPage.bots.length === 0) {
      await expireChallengeWithoutBot(roomPage.challengeInvitationId);
    } else {
      await showRoomView("create");
    }
  }
  await loadPublicRooms();
  roomPage.listTimer = window.setInterval(() => {
    void loadPublicRooms();
    if (isAuthenticated) void loadMyRooms();
  }, 10_000);

  window.addEventListener("beforeunload", () => {
    window.clearInterval(roomPage.pollingTimer);
    window.clearInterval(roomPage.presenceTimer);
    window.clearInterval(roomPage.listTimer);
  });
}

async function showRoomView(view) {
  if (view === "create" && localStorage.getItem("token")) {
    try {
      await refreshActivePlayerRoom();
    } catch (error) {
      showPageMessage(`Không thể kiểm tra phòng hiện tại: ${error.message}`, "error");
      return;
    }
    if (roomPage.activePlayerRoom) {
      showPageMessage(
        `Bạn đang trong phòng "${roomPage.activePlayerRoom.name}". Hãy quay lại phòng đó và rời phòng/giải tán trước khi tạo phòng mới.`,
        "error"
      );
      return;
    }
  }
  const home = document.getElementById("roomsHomePanel");
  const homeLists = document.getElementById("roomsHomeLists");
  const create = document.getElementById("createRoomCard");
  const search = document.getElementById("privateRoomSearchCard");

  home.hidden = view !== "home";
  homeLists.hidden = view !== "home";
  create.hidden = view !== "create";
  search.hidden = view !== "search";
  document.getElementById("pageMessage").classList.remove("visible");

  if (view === "create" && !localStorage.getItem("token")) {
    window.location.href = "/login.html";
    return;
  }
  if (view !== "home") {
    (view === "create" ? create : search).scrollIntoView({ behavior: "smooth" });
  }
}

async function refreshActivePlayerRoom() {
  const response = await window.api.get("/rooms/mine");
  const rooms = response?.data?.rooms;
  if (!Array.isArray(rooms)) {
    throw new Error("Máy chủ trả về danh sách phòng không hợp lệ.");
  }
  roomPage.activePlayerRoom = rooms[0] || null;
}

async function loadAvailableBots() {
  try {
    const response = await window.api.get("/bots");
    const data = response?.data;
    const bots = Array.isArray(data) ? data : data?.bots ?? data?.items;
    if (!Array.isArray(bots)) {
      throw new Error("Máy chủ trả về danh sách bot không hợp lệ.");
    }
    roomPage.bots = bots.filter((bot) => bot.isActive !== false);
    roomPage.botsLoaded = true;
    renderBotOptions();
  } catch (error) {
    showPageMessage(`Không thể tải bot của bạn: ${error.message}`, "error");
  }
}

function renderBotOptions() {
  for (const id of ["roomBotSelect", "changeRoomBotSelect"]) {
    const select = document.getElementById(id);
    select.replaceChildren(new Option("Chọn bot", ""));
    for (const bot of roomPage.bots) {
      select.add(new Option(bot.name, String(bot.id)));
    }
    select.disabled = roomPage.bots.length === 0;
  }
}

async function createRoom(event) {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  if (roomPage.bots.length === 0) {
    showPageMessage("Bạn cần có ít nhất một bot đang hoạt động để tạo phòng.", "error");
    return;
  }
  setBusy("createRoomBtn", true, "Đang tạo phòng...");
  try {
    await refreshActivePlayerRoom();
    if (roomPage.activePlayerRoom) {
      showPageMessage(
        `Bạn đang trong phòng "${roomPage.activePlayerRoom.name}". Hãy quay lại phòng đó và rời phòng/giải tán trước khi tạo phòng mới.`,
        "error"
      );
      return;
    }
    const password = document.getElementById("roomPassword").value;
    const response = await window.api.post("/rooms", {
      name: document.getElementById("roomName").value.trim(),
      password,
      visibility: document.getElementById("roomVisibility").value,
      ...(roomPage.challengeInvitationId
        ? { challengeInvitationId: Number(roomPage.challengeInvitationId) }
        : {}),
    });
    const room = response?.data?.room;
    if (!room?.id) throw new Error("Máy chủ không trả về phòng vừa tạo.");
    sessionStorage.setItem(roomCredentialKey(room.id), room.password || password);
    window.location.href = `/matches.html?id=${encodeURIComponent(room.id)}`;
  } catch (error) {
    if (error.code === "ROOM_PLAYER_ALREADY_IN_ROOM") {
      await refreshActivePlayerRoom().catch(() => {});
      showPageMessage(
        `Bạn đang trong phòng${roomPage.activePlayerRoom ? ` "${roomPage.activePlayerRoom.name}"` : ""}. Hãy quay lại phòng hiện tại và rời phòng/giải tán trước khi tạo phòng mới.`,
        "error"
      );
    } else if (
      error.code === "ROOM_REQUIRES_ACTIVE_BOT" &&
      roomPage.challengeInvitationId
    ) {
      await expireChallengeWithoutBot(roomPage.challengeInvitationId);
    } else {
      showPageMessage(`Không thể tạo phòng: ${error.message}`, "error");
    }
  } finally {
    setBusy("createRoomBtn", false);
  }
}

async function expireChallengeWithoutBot(invitationId) {
  sessionStorage.setItem(`ott-skipped-duel-challenge:${invitationId}`, "1");
  void window.api
    .post(
      `/friends/invitations/${encodeURIComponent(invitationId)}/expire-without-bot`
    )
    .catch((error) => {
      console.error("Không thể cập nhật trạng thái lời mời thiếu bot:", error);
    });
  showSocialToast(
    "Bạn cần có ít nhất một bot đang hoạt động để tham gia đấu. Lời mời này đã kết thúc.",
    true
  );
  roomPage.challengeInvitationId = null;
  document.getElementById("challengeInvitationId").value = "";
  const url = new URL(window.location.href);
  url.searchParams.delete("createChallenge");
  window.history.replaceState({}, "", url);
  await showRoomView("home");
}

async function loadPublicRooms() {
  try {
    const response = await window.api.get("/rooms/public");
    const rooms = response?.data?.rooms;
    if (!Array.isArray(rooms)) {
      throw new Error("Máy chủ trả về danh sách phòng không hợp lệ.");
    }
    renderRoomList("publicRoomsList", rooms, "public");
  } catch (error) {
    renderRoomListError("publicRoomsList", error, loadPublicRooms);
  }
}

async function loadMyRooms() {
  try {
    const response = await window.api.get("/rooms/mine");
    const rooms = response?.data?.rooms;
    if (!Array.isArray(rooms)) {
      throw new Error("Máy chủ trả về danh sách phòng không hợp lệ.");
    }
    roomPage.activePlayerRoom = rooms[0] || null;
    renderRoomList("myRoomsList", rooms, "mine");
  } catch (error) {
    renderRoomListError("myRoomsList", error, loadMyRooms);
  }
}

async function searchRooms(event) {
  event.preventDefault();
  const name = document.getElementById("privateRoomSearch").value.trim();
  if (name.length < 2) return;

  try {
    const response = await window.api.get(
      `/rooms/search?name=${encodeURIComponent(name)}`
    );
    const rooms = response?.data?.rooms;
    if (!Array.isArray(rooms)) {
      throw new Error("Máy chủ trả về danh sách phòng không hợp lệ.");
    }
    renderRoomList("privateRoomsList", rooms, "search");
    if (rooms.length === 0) {
      showPageMessage("Không tìm thấy phòng công khai hoặc riêng tư phù hợp.", "info");
    }
  } catch (error) {
    showPageMessage(`Không thể tìm phòng: ${error.message}`, "error");
  }
}

function renderRoomList(containerId, rooms, source) {
  const container = document.getElementById(containerId);
  container.replaceChildren();
  if (rooms.length === 0) {
    const empty = document.createElement("p");
    empty.className = "room-list-empty";
    empty.textContent =
      source === "mine" ? "Bạn chưa tham gia phòng nào." : "Hiện chưa có phòng nào.";
    container.append(empty);
    return;
  }

  for (const room of rooms) {
    const card = document.createElement("article");
    card.className = "room-list-card";

    const details = document.createElement("div");
    details.className = "room-list-details";
    const title = document.createElement("h3");
    title.textContent = room.name;
    const summary = document.createElement("p");
    summary.textContent =
      `${roomStatusLabel(room.status)} · ${room.players?.length ?? 0}/2 người chơi · ` +
      (room.visibility === "private" ? "Riêng tư" : "Công khai");
    details.append(title, summary);

    const actions = document.createElement("div");
    actions.className = "room-list-actions";
    if (source === "mine") {
      actions.append(createButton("Vào lại phòng", "btn btn-primary", () => {
        window.location.href = `/matches.html?id=${encodeURIComponent(room.id)}`;
      }));
    } else if (room.status === "waiting" && localStorage.getItem("token")) {
      const alreadyInOtherRoom =
        roomPage.activePlayerRoom &&
        String(roomPage.activePlayerRoom.id) !== String(room.id);
      const joinButton = createButton("Tham gia", "btn btn-primary", () => {
        showRoomAccessForm(room.id, "join", room.name);
      });
      if (alreadyInOtherRoom) {
        joinButton.disabled = true;
        joinButton.title = `Hãy rời phòng "${roomPage.activePlayerRoom.name}" trước.`;
      }
      actions.append(joinButton);
      actions.append(createButton("Xem", "btn btn-secondary", () => {
        showRoomAccessForm(room.id, "watch", room.name);
      }));
    } else {
      actions.append(createButton("Xem trận", "btn btn-primary", () => {
        showRoomAccessForm(room.id, "watch", room.name);
      }));
    }
    card.append(details, actions);
    container.append(card);
  }
}

function createButton(label, className, action) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = label;
  button.addEventListener("click", action);
  return button;
}

function renderRoomListError(containerId, error, retry) {
  const container = document.getElementById(containerId);
  container.replaceChildren();
  const message = document.createElement("p");
  message.className = "room-list-empty";
  message.textContent = `Không thể tải danh sách phòng: ${error.message}`;
  const button = createButton("Thử lại", "btn btn-secondary", retry);
  container.append(message, button);
}

function showRoomAccessForm(id, mode, name) {
  roomPage.access = { id, mode };
  document.getElementById("roomAccessHeading").textContent =
    mode === "join" ? `Tham gia phòng: ${name}` : `Xem phòng: ${name}`;
  document.getElementById("roomAccessDescription").textContent =
    mode === "join"
      ? "Nhập mật khẩu để vào phòng với tư cách người chơi."
      : "Nhập mật khẩu để vào phòng với tư cách người xem.";
  document.getElementById("roomAccessSubmit").textContent =
    mode === "join" ? "Tham gia phòng" : "Vào xem";
  document.getElementById("roomAccessPassword").value = "";
  document.getElementById("roomDialogMessage").hidden = true;
  document.getElementById("roomAccessCard").hidden = false;
  document.getElementById("spectatorPasswordCard").hidden = true;
  document.getElementById("roomAccessDialog").showModal();
  document.getElementById("roomAccessPassword").focus();
}

async function submitRoomAccess(event) {
  event.preventDefault();
  if (!roomPage.access) return;
  const { id, mode } = roomPage.access;
  const password = document.getElementById("roomAccessPassword").value;
  setBusy("roomAccessSubmit", true, "Đang xác thực...");
  document.getElementById("roomDialogMessage").hidden = true;
  try {
    if (mode === "join") {
      if (!localStorage.getItem("token")) {
        throw new Error("Bạn cần đăng nhập để tham gia thi đấu.");
      }
      await refreshActivePlayerRoom();
      if (
        roomPage.activePlayerRoom &&
        String(roomPage.activePlayerRoom.id) !== String(id)
      ) {
        showPageMessage(
          `Bạn đang trong phòng "${roomPage.activePlayerRoom.name}". Hãy quay lại phòng đó và rời phòng/giải tán trước khi tham gia phòng khác.`,
          "error"
        );
        throw new Error(
          `Bạn đang trong phòng "${roomPage.activePlayerRoom.name}". Hãy rời phòng đó trước khi tham gia phòng khác.`
        );
      }
      await window.api.post(`/rooms/${encodeURIComponent(id)}/join`, { password });
    } else {
      const response = await window.api.post(
        `/rooms/${encodeURIComponent(id)}/viewer-session`,
        { password }
      );
      const token = response?.data?.token;
      if (!token) throw new Error("Máy chủ không cấp quyền xem phòng.");
      sessionStorage.setItem(viewerTokenKey(id), token);
    }
    sessionStorage.setItem(roomCredentialKey(id), password);
    window.location.href = `/matches.html?id=${encodeURIComponent(id)}`;
  } catch (error) {
    if (error.code === "ROOM_PLAYER_ALREADY_IN_ROOM") {
      await refreshActivePlayerRoom().catch(() => {});
      showPageMessage(
        `Bạn đang trong phòng${roomPage.activePlayerRoom ? ` "${roomPage.activePlayerRoom.name}"` : ""}. Hãy quay lại phòng hiện tại và rời phòng/giải tán trước khi tham gia phòng khác.`,
        "error"
      );
    }
    showRoomDialogMessage(error.message);
  } finally {
    setBusy("roomAccessSubmit", false);
  }
}

function showSpectatorPasswordForm() {
  document.getElementById("roomDialogMessage").hidden = true;
  document.getElementById("roomAccessCard").hidden = true;
  document.getElementById("spectatorPasswordCard").hidden = false;
  document.getElementById("roomAccessDialog").showModal();
  document.getElementById("spectatorPassword").focus();
}

async function enterAsSpectator(event) {
  event.preventDefault();
  if (!roomPage.roomId) return;
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  document.getElementById("roomDialogMessage").hidden = true;
  try {
    const password = document.getElementById("spectatorPassword").value;
    const response = await window.api.post(
      `/rooms/${encodeURIComponent(roomPage.roomId)}/viewer-session`,
      { password }
    );
    const token = response?.data?.token;
    if (!token) throw new Error("Máy chủ không cấp quyền xem phòng.");
    sessionStorage.setItem(viewerTokenKey(roomPage.roomId), token);
    sessionStorage.setItem(roomCredentialKey(roomPage.roomId), password);
    document.getElementById("roomAccessDialog").close();
    await loadRoom(roomPage.roomId, token);
  } catch (error) {
    showRoomDialogMessage(error.message);
  }
}

async function loadRoom(id, viewerToken) {
  if (!/^\d+$/.test(id) || roomPage.loadingRoom) return;
  roomPage.loadingRoom = true;
  try {
    const response = viewerToken
      ? await window.api.request(`/rooms/${encodeURIComponent(id)}`, {
          headers: { "X-Room-Viewer-Token": viewerToken },
        })
      : await window.api.get(`/rooms/${encodeURIComponent(id)}`);
    const room = response?.data?.room;
    if (!room) throw new Error("Máy chủ không trả về dữ liệu phòng.");
    if (typeof room.password === "string") {
      sessionStorage.setItem(roomCredentialKey(id), room.password);
    }
    roomPage.room = room;
    roomPage.roomId = id;
    document.getElementById("roomPanel").hidden = false;
    if (document.getElementById("roomAccessDialog").open) {
      document.getElementById("roomAccessDialog").close();
    }
    renderRoom(room);
    await sendRoomHeartbeat();
  } catch (error) {
    if (error.status === 404 && roomPage.roomId === id) {
      sessionStorage.removeItem(viewerTokenKey(id));
      sessionStorage.removeItem(presenceSessionKey(id));
      sessionStorage.removeItem(roomCredentialKey(id));
      window.location.replace("/matches.html");
      return;
    }
    if (error.message.includes("mật khẩu") || error.message.includes("quyền")) {
      showSpectatorPasswordForm();
    } else {
      showPageMessage(`Không thể tải phòng: ${error.message}`, "error");
    }
  } finally {
    roomPage.loadingRoom = false;
  }
}

async function pollRoom() {
  if (!roomPage.roomId || roomPage.loadingRoom) return;
  const viewerToken = sessionStorage.getItem(viewerTokenKey(roomPage.roomId));
  if (!viewerToken && !roomPage.room?.isPlayer) return;
  await loadRoom(roomPage.roomId, viewerToken);
}

function renderRoom(room) {
  document.getElementById("roomIdLabel").textContent = `#${room.id}`;
  document.getElementById("roomTitle").textContent = room.name;
  document.getElementById("roomNameDisplay").textContent = room.name;
  document.getElementById("roomStatus").textContent =
    `${roomStatusLabel(room.status)} · ${room.visibility === "private" ? "Phòng riêng tư" : "Phòng công khai"}`;
  const roomPassword = sessionStorage.getItem(roomCredentialKey(room.id));
  document.getElementById("roomPasswordDisplay").textContent =
    roomPassword || "Không thể khôi phục mật khẩu gốc của phòng cũ";
  document.getElementById("copyRoomPasswordBtn").disabled = !roomPassword;

  renderRoomPlayers(room);
  const waiting = room.status === "waiting";
  const completed = ["completed", "failed"].includes(room.status);
  const running = ["running", "paused"].includes(room.status);
  document.getElementById("lobbyPanel").hidden = !waiting;
  const roomFriendsSection = document.getElementById("roomFriendsSection");
  roomFriendsSection.hidden = !waiting || !room.isHost;
  if (waiting && room.isHost) void loadRoomFriends();
  document.getElementById("gamePanel").hidden = !room.match;
  const isSpectator =
    !room.isPlayer && Boolean(sessionStorage.getItem(viewerTokenKey(room.id)));
  const showWaitingControls = waiting && (room.isHost || room.isPlayer);
  document.getElementById("waitingRoomControls").hidden = !showWaitingControls;
  document.getElementById("waitingLeaveRoomBtn").hidden =
    room.isHost || !room.isPlayer;
  document.getElementById("waitingDissolveRoomBtn").hidden = !room.isHost;
  document.getElementById("resultLeaveRoomBtn").hidden =
    room.isHost || !(room.isPlayer || isSpectator);
  document.getElementById("resultDissolveRoomBtn").hidden = !room.isHost;
  document.getElementById("roomExitMessage").textContent =
    "Bạn có thể rời sảnh chờ bất cứ lúc nào.";
  renderRematchControls(room, room.status === "completed");

  if (room.match) renderMatch(room);
  const resultDialog = document.getElementById("matchResultDialog");
  if (completed && room.match?.result) {
    if (!resultDialog.open) resultDialog.showModal();
  } else if (resultDialog.open) {
    resultDialog.close();
  }

  async function loadRoomFriends() {
    const container = document.getElementById("roomFriendsList");
    if (Date.now() - roomPage.roomFriendsLoadedAt < 7_000 && container.childElementCount) {
      return;
    }
    roomPage.roomFriendsLoadedAt = Date.now();
    try {
      const response = await window.api.get("/friends");
      const friends = response?.data?.friends;
      if (!Array.isArray(friends)) {
        throw new Error("Máy chủ trả về danh sách bạn bè không hợp lệ.");
      }
      container.replaceChildren();
      const onlineFriends = friends.filter((friend) => friend.online);
      if (!onlineFriends.length) {
        const empty = document.createElement("p");
        empty.className = "room-friend-empty";
        empty.textContent = "Không có bạn bè nào đang trực tuyến.";
        container.append(empty);
        return;
      }
      for (const friend of onlineFriends) {
        const row = document.createElement("div");
        row.className = "room-friend-row";
        const name = document.createElement("span");
        name.textContent = friend.username;
        const button = createButton("Mời vào phòng", "btn btn-secondary", async () => {
          button.disabled = true;
          try {
            await window.api.post(
              `/friends/rooms/${encodeURIComponent(roomPage.room.id)}/invitations`,
              { friendId: friend.id }
            );
            showPageMessage(
              `Đã mời ${friend.username}. Lời mời có hiệu lực trong 10 giây.`,
              "success"
            );
          } catch (error) {
            showPageMessage(`Không thể mời ${friend.username}: ${error.message}`, "error");
            button.disabled = false;
          }
        });
        row.append(name, button);
        container.append(row);
      }
    } catch (error) {
      showPageMessage(`Không thể tải bạn bè trực tuyến: ${error.message}`, "error");
    }
  }
  if (room.status === "waiting" && room.isPlayer) {
    const currentPlayer = room.players.find((player) => player.isCurrentUser);
    const readyButton = document.getElementById("readyBtn");
    readyButton.textContent = currentPlayer?.isReady
      ? "Hủy sẵn sàng"
      : "Sẵn sàng";
    if (!roomPage.botSelectionDirty) {
      roomPage.selectedBotId = currentPlayer?.botId
        ? String(currentPlayer.botId)
        : "";
    }
    document.getElementById("roomBotSelect").value = roomPage.selectedBotId;
  }
  const startButton = document.getElementById("startRoomBtn");
  startButton.hidden = !waiting || !room.isHost;
  startButton.disabled =
    room.players.length !== 2 ||
    room.players.some((player) => !player.isReady || !player.botId);
}

function renderRoomPlayers(room) {
  const container = document.getElementById("roomPlayers");
  container.replaceChildren();
  for (const player of room.players) {
    const item = document.createElement("article");
    item.className = "room-player-card";
    const name = document.createElement("strong");
    name.textContent = player.user?.username || `Người chơi ${player.slot + 1}`;
    const bot = document.createElement("span");
    bot.textContent = player.bot?.name
      ? `Bot: ${player.bot.name}`
      : "Chưa chọn bot";
    const ready = document.createElement("span");
    ready.className = `room-ready-state${player.isReady ? " ready" : ""}`;
    ready.textContent = player.isReady ? "Đã sẵn sàng" : "Chưa sẵn sàng";
    item.append(name, bot, ready);
    container.append(item);
  }
  if (room.players.length < 2) {
    const waiting = document.createElement("p");
    waiting.className = "room-list-empty";
    waiting.textContent = "Đang chờ người chơi thứ hai...";
    container.append(waiting);
  }
  const controls = document.getElementById("roomPlayerControls");
  controls.hidden = room.status !== "waiting" || !room.isPlayer;
  if (!room.isPlayer) return;
}

async function toggleReady() {
  const room = roomPage.room;
  const player = room?.players.find((entry) => entry.isCurrentUser);
  const botId = Number(document.getElementById("roomBotSelect").value);
  if (!player || !Number.isSafeInteger(botId) || botId <= 0) {
    showPageMessage("Chọn bot của bạn trước khi xác nhận sẵn sàng.", "error");
    return;
  }
  const updated = await roomAction("readyBtn", "Đang cập nhật...", async () =>
    window.api.patch(`/rooms/${encodeURIComponent(room.id)}/ready`, {
      botId,
      isReady: !player.isReady,
    })
  );
  if (updated) {
    roomPage.botSelectionDirty = false;
    roomPage.selectedBotId = String(botId);
    await pollRoom();
  }
}

async function startRoom() {
  await roomAction("startRoomBtn", "Đang bắt đầu...", async () =>
    window.api.post(`/rooms/${encodeURIComponent(roomPage.room.id)}/start`)
  );
  if (roomPage.room) renderRoom(roomPage.room);
}

async function pauseMatch() {
  await roomAction("pauseMatchBtn", "Đang tạm dừng...", async () =>
    window.api.post(`/rooms/${encodeURIComponent(roomPage.room.id)}/pause`)
  );
}

async function resumeMatch() {
  await roomAction("resumeMatchBtn", "Đang tiếp tục...", async () =>
    window.api.post(`/rooms/${encodeURIComponent(roomPage.room.id)}/resume`)
  );
}

async function changeRoomBot() {
  const botId = Number(document.getElementById("changeRoomBotSelect").value);
  if (!Number.isSafeInteger(botId) || botId <= 0) {
    showPageMessage("Hãy chọn bot muốn sử dụng.", "error");
    return;
  }
  await roomAction("changeRoomBotBtn", "Đang đổi bot...", async () =>
    window.api.patch(`/rooms/${encodeURIComponent(roomPage.room.id)}/bot`, {
      botId,
    })
  );
}

async function leaveRoom(buttonId) {
  if (!window.confirm("Bạn muốn rời khỏi phòng này?")) return;
  const roomId = roomPage.room.id;
  const viewerToken = sessionStorage.getItem(viewerTokenKey(roomId));
  const isSpectator = !roomPage.room.isPlayer && Boolean(viewerToken);
  const left = await roomAction(buttonId, "Đang rời phòng...", async () => {
    if (
      roomPage.room.isHost &&
      ["waiting", "completed", "failed"].includes(roomPage.room.status)
    ) {
      return window.api.delete(`/rooms/${encodeURIComponent(roomId)}`);
    }
    if (isSpectator) {
      return window.api.request(`/rooms/${encodeURIComponent(roomId)}/leave-viewer`, {
        method: "POST",
        headers: { "X-Room-Viewer-Token": viewerToken },
        body: JSON.stringify({ sessionId: getPresenceSessionId(roomId) }),
      });
    }
    return window.api.post(`/rooms/${encodeURIComponent(roomId)}/leave`);
  }, { refresh: false });
  if (!left) return;
  sessionStorage.removeItem(viewerTokenKey(roomId));
  sessionStorage.removeItem(presenceSessionKey(roomId));
  sessionStorage.removeItem(roomCredentialKey(roomId));
  window.location.href = "/matches.html";
}

async function dissolveRoom(buttonId) {
  if (!window.confirm("Giải tán phòng và xóa phòng khỏi danh sách?")) return;
  const dissolved = await roomAction(
    buttonId,
    "Đang giải tán...",
    async () => window.api.delete(`/rooms/${encodeURIComponent(roomPage.room.id)}`),
    { refresh: false }
  );
  if (!dissolved) return;
  sessionStorage.removeItem(viewerTokenKey(roomPage.roomId));
  sessionStorage.removeItem(presenceSessionKey(roomPage.roomId));
  sessionStorage.removeItem(roomCredentialKey(roomPage.roomId));
  window.location.href = "/matches.html";
}

async function requestRematch() {
  await roomAction("requestRematchBtn", "Đang gửi lời mời...", async () =>
    window.api.post(`/rooms/${encodeURIComponent(roomPage.room.id)}/rematch`)
  );
}

async function respondRematch(accept) {
  const buttonId = accept ? "acceptRematchBtn" : "declineRematchBtn";
  const result = await roomAction(
    buttonId,
    accept ? "Đang xác nhận..." : "Đang gửi...",
    async () => window.api.post(`/rooms/${encodeURIComponent(roomPage.room.id)}/rematch/respond`, {
      accept,
    }),
    { refresh: false }
  );
  if (!result) return;
  if (!accept || result.data?.left) {
    const roomId = roomPage.room.id;
    sessionStorage.removeItem(viewerTokenKey(roomId));
    sessionStorage.removeItem(presenceSessionKey(roomId));
    sessionStorage.removeItem(roomCredentialKey(roomId));
    window.location.href = "/matches.html";
    return;
  }
  await pollRoom();
}

async function roomAction(buttonId, label, action, { refresh = true } = {}) {
  setBusy(buttonId, true, label);
  try {
    const result = await action();
    if (refresh) await pollRoom();
    await loadMyRooms();
    await loadPublicRooms();
    return result ?? true;
  } catch (error) {
    showPageMessage(error.message, "error");
    return false;
  } finally {
    setBusy(buttonId, false);
  }
}

async function sendRoomHeartbeat() {
  const roomId = roomPage.roomId;
  if (!roomId || (!roomPage.room?.isPlayer && !sessionStorage.getItem(viewerTokenKey(roomId)))) {
    return;
  }
  const sessionId = getPresenceSessionId(roomId);
  const viewerToken = sessionStorage.getItem(viewerTokenKey(roomId));
  try {
    await window.api.request(`/rooms/${encodeURIComponent(roomId)}/presence`, {
      method: "POST",
      headers: viewerToken ? { "X-Room-Viewer-Token": viewerToken } : {},
      body: JSON.stringify({ sessionId }),
    });
  } catch (error) {
    console.error("Không thể cập nhật trạng thái hiện diện trong phòng:", error);
  }
}

function getPresenceSessionId(roomId) {
  const key = presenceSessionKey(roomId);
  let sessionId = sessionStorage.getItem(key);
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    sessionStorage.setItem(key, sessionId);
  }
  return sessionId;
}

function renderRematchControls(room, completed) {
  const controls = [
    "requestRematchBtn",
    "acceptRematchBtn",
    "declineRematchBtn",
    "rematchStatusMessage",
  ];
  for (const id of controls) document.getElementById(id).hidden = true;

  const player = room.players.find((entry) => entry.isCurrentUser);
  if (
    !completed ||
    !room.isPlayer ||
    !player ||
    room.players.length !== 2 ||
    room.players.some((entry) => entry.leftAt || !entry.bot?.isActive)
  ) {
    return;
  }

  const status = document.getElementById("rematchStatusMessage");
  const request = document.getElementById("requestRematchBtn");
  const accept = document.getElementById("acceptRematchBtn");
  const decline = document.getElementById("declineRematchBtn");
  status.hidden = false;

  if (room.rematchStatus === "pending") {
    const secondsLeft = Math.max(
      0,
      Math.ceil((new Date(room.rematchExpiresAt).getTime() - Date.now()) / 1000)
    );
    if (player.rematchAccepted) {
      status.textContent = `Bạn đã gửi lời mời đấu tiếp. Đang chờ đối thủ đồng ý: còn ${secondsLeft} giây.`;
    } else {
      status.textContent = `Đối thủ mời đấu tiếp. Bạn còn ${secondsLeft} giây để chọn chấp nhận hoặc từ chối.`;
      accept.hidden = false;
      decline.hidden = false;
    }
    return;
  }

  status.textContent = room.rematchStatus === "expired"
    ? "Lời mời đấu tiếp đã hết hạn. Bạn có thể gửi lời mời mới."
    : "";
  request.hidden = false;
}

function closeRoomAccessDialog() {
  const dialog = document.getElementById("roomAccessDialog");
  if (dialog.open) dialog.close();
  document.getElementById("roomAccessCard").hidden = true;
  document.getElementById("spectatorPasswordCard").hidden = true;
  if (new URLSearchParams(window.location.search).has("id")) {
    window.location.href = "/matches.html";
  }
}

function showRoomDialogMessage(message) {
  const element = document.getElementById("roomDialogMessage");
  element.textContent = message;
  element.hidden = false;
}

function renderMatch(room) {
  const match = room.match;
  const state = match?.result;
  if (!state) return;
  const participants = match.participants || [];
  const playerNames = new Map(
    participants.map((participant, index) => {
      const seat = room.players[index];
      const username = seat?.user?.username || `Người chơi ${index + 1}`;
      return [
        String(participant.id),
        `${username} · ${participant.bot?.name || `Bot ${participant.botId}`}`,
      ];
    })
  );
  const winner = playerNames.get(state.winnerId);
  const matchStatus = document.getElementById("matchStatus");
  renderMatchResult(room, state, participants, playerNames);
  if (!Array.isArray(state.pieces) || !Array.isArray(state.players)) {
    matchStatus.textContent = `Trận đã dừng do lỗi khi chạy bot${
      state.error ? `: ${state.error}` : "."
    }`;
    document.getElementById("matchBoard").replaceChildren();
    document.getElementById("matchHistory").replaceChildren();
    document.getElementById("playerMatchControls").hidden = true;
    document.getElementById("pauseNotice").hidden = true;
    document.getElementById("changeBotSection").hidden = true;
    return;
  }
  matchStatus.textContent = match.status === "completed"
    ? describeWinReason(state.winReason, winner)
    : room.status === "paused"
      ? "Trận đang tạm dừng."
      : `Lượt ${state.turn + 1} · Đến lượt ${playerNames.get(state.currentPlayerId) || "bot"}`;

  renderBoard(state, playerNames);
  renderHistory(state, playerNames);
  const isPlayer = room.isPlayer;
  const isRunning = room.status === "running";
  const isPaused = room.status === "paused";
  const isFinished = ["completed", "failed"].includes(room.status);
  const ownSeat = room.players.find((player) => player.isCurrentUser);
  const ownPauseRemaining = ownSeat && room.status === "paused" &&
      room.pausedByUserId === ownSeat.user?.id
    ? room.pauseRemainingMs
    : null;
  document.getElementById("playerMatchControls").hidden = !isPlayer || isFinished;
  document.getElementById("pauseMatchBtn").hidden = !isRunning;
  document.getElementById("pauseMatchBtn").disabled =
    !ownSeat || room.pauseRemainingMs <= 0;
  document.getElementById("resumeMatchBtn").hidden = !isPaused || !isPlayer;
  document.getElementById("pauseBudgetLabel").textContent = ownSeat
    ? `Thời gian tạm dừng còn lại của bạn: ${formatSeconds(room.pauseRemainingMs)} giây`
    : "";
  document.getElementById("pauseNotice").hidden = !isPaused;
  document.getElementById("pauseNotice").textContent = isPaused
    ? `Trận đang tạm dừng. Tự tiếp tục sau ${formatSeconds(
        ownPauseRemaining === null
          ? Math.max(
              0,
              30_000 - (Date.now() - new Date(room.pauseStartedAt).getTime())
            )
          : Math.max(
              0,
              ownPauseRemaining -
                (Date.now() - new Date(room.pauseStartedAt).getTime())
            )
      )} giây.`
    : "";
  document.getElementById("changeBotSection").hidden = !isPaused || !isPlayer;
  document.getElementById("changeRoomBotSelect").value =
    ownSeat?.botId ? String(ownSeat.botId) : "";
}

function renderMatchResult(room, state, participants, playerNames) {
  const title = document.getElementById("matchResultTitle");
  const message = document.getElementById("matchResultMessage");
  if (room.status === "failed" || !state.winnerId) {
    title.textContent = state.winReason === "turn_limit"
      ? "Trận đấu hòa"
      : "Trận đấu đã dừng";
    message.textContent = state.error
      ? `Không thể tiếp tục trận đấu: ${state.error}`
      : "Không có người chiến thắng trong trận này.";
    return;
  }

  const winningParticipantIndex = participants.findIndex(
    (participant) => String(participant.id) === String(state.winnerId)
  );
  const winnerName = playerNames.get(String(state.winnerId)) || "Người chơi";
  const loser = participants.find(
    (participant) => String(participant.id) !== String(state.winnerId)
  );
  const loserName = loser
    ? playerNames.get(String(loser.id)) || "Người chơi"
    : "Người chơi";
  const currentSeatIndex = room.players.findIndex((player) => player.isCurrentUser);
  const currentParticipant = participants[currentSeatIndex];
  const isCurrentPlayerWinner =
    room.isPlayer &&
    currentParticipant &&
    String(currentParticipant.id) === String(state.winnerId);

  title.textContent = `${winnerName} chiến thắng!`;
  message.textContent = room.isPlayer
    ? `${isCurrentPlayerWinner ? "Bot của bạn thắng" : "Bot của bạn thua"} · Bên thắng: ${winnerName} · Bên thua: ${loserName}.`
    : `Bên thắng: ${winnerName} · Bên thua: ${loserName}.`;
  if (winningParticipantIndex < 0) {
    message.textContent = "Không xác định được người chiến thắng của trận đấu.";
  }
}

function renderBoard(state, playerNames) {
  const board = document.getElementById("matchBoard");
  const cells = new Map();
  const lastMoves = getLastMoveByPlayer(state.history);
  const playerIndexes = new Map(
    state.players.map((player, index) => [String(player.id), index])
  );
  board.replaceChildren();
  board.style.setProperty("--board-size", String(state.boardSize));

  const corner = document.createElement("span");
  corner.className = "board-axis board-corner";
  board.append(corner);
  for (let x = 0; x < state.boardSize; x += 1) {
    const label = document.createElement("span");
    label.className = "board-axis";
    label.textContent = String.fromCharCode(65 + x);
    board.append(label);
  }

  for (let y = state.boardSize - 1; y >= 0; y -= 1) {
    const rank = document.createElement("span");
    rank.className = "board-axis";
    rank.textContent = String(y + 1);
    board.append(rank);
    for (let x = 0; x < state.boardSize; x += 1) {
      const cell = document.createElement("div");
      cell.className = "board-cell" + ((x + y) % 2 ? " dark" : "");
      cell.dataset.position = `${String.fromCharCode(97 + x)}${y + 1}`;
      if (x === 0 && y === 0) {
        cell.classList.add("home-a");
        cell.setAttribute("aria-label", `${cell.dataset.position}, nhà chính bên A`);
      } else if (x === state.boardSize - 1 && y === state.boardSize - 1) {
        cell.classList.add("home-b");
        cell.setAttribute("aria-label", `${cell.dataset.position}, nhà chính bên B`);
      }
      for (const [playerId, move] of lastMoves) {
        if (move.to.x !== x || move.to.y !== y) continue;
        const playerIndex = playerIndexes.get(playerId);
        if (playerIndex === undefined) continue;
        const side = playerIndex === 0 ? "A" : "B";
        const labels = [cell.dataset.position];
        if (cell.classList.contains("home-a")) labels.push("nhà chính bên A");
        if (cell.classList.contains("home-b")) labels.push("nhà chính bên B");
        labels.push(`nước đi gần nhất của bên ${side}`);
        cell.classList.add("last-move");
        cell.classList.add(playerIndex === 0 ? "last-move-a" : "last-move-b");
        cell.dataset.lastMovePlayer = side;
        cell.title = `Nước đi gần nhất của bên ${side}: ${move.pieceId} đến ${cell.dataset.position}`;
        cell.setAttribute("aria-label", labels.join(", "));
      }
      cells.set(`${x},${y}`, cell);
      board.append(cell);
    }
  }

  for (const piece of state.pieces) {
    const cell = cells.get(`${piece.x},${piece.y}`);
    if (!cell) continue;
    const token = document.createElement("span");
    token.className =
      `game-piece ${piece.ownerId === state.players[0].id ? "side-a" : "side-b"} type-${piece.type}`;
    token.textContent = formatPieceType(piece.type);
    token.title =
      `${playerNames.get(piece.ownerId) || "Bot"} · ${formatPieceType(piece.type)} · ${cell.dataset.position}`;
    cell.append(token);
  }
}

function getLastMoveByPlayer(history) {
  const lastMoves = new Map();
  if (!Array.isArray(history)) return lastMoves;

  for (let index = history.length - 1; index >= 0; index -= 1) {
    const turn = history[index];
    if (
      !turn.valid ||
      !turn.action?.pieceId ||
      !Number.isInteger(turn.action.to?.x) ||
      !Number.isInteger(turn.action.to?.y)
    ) {
      continue;
    }
    const playerId = String(turn.playerId);
    if (!lastMoves.has(playerId)) {
      lastMoves.set(playerId, {
        pieceId: turn.action.pieceId,
        to: turn.action.to,
      });
    }
  }

  return lastMoves;
}

function renderHistory(state, playerNames) {
  const list = document.getElementById("matchHistory");
  list.replaceChildren();
  for (const turn of state.history.slice(-20).reverse()) {
    const item = document.createElement("li");
    const move = turn.valid
      ? `${turn.action.pieceId} → ${turn.action.to.name || `${String.fromCharCode(97 + turn.action.to.x)}${turn.action.to.y + 1}`}`
      : `Nước đi không hợp lệ: ${describeMoveError(turn.reason)}`;
    item.textContent =
      `#${turn.turn} ${playerNames.get(turn.playerId) || "Bot"}: ${move}`;
    list.append(item);
  }
  if (list.children.length === 0) {
    const item = document.createElement("li");
    item.textContent = "Trận chưa có lượt đi.";
    list.append(item);
  }
}

function describeWinReason(reason, winnerName) {
  const descriptions = {
    reached_opponent_home: "đã đưa quân vào nhà chính của đối phương",
    all_opponent_pieces_captured: "đã ăn hết toàn bộ quân đối phương",
    turn_limit: "trận hòa do đã đạt giới hạn lượt",
  };
  if (reason === "turn_limit") return "Trận đấu kết thúc với kết quả hòa.";
  return `${winnerName || "Người chơi"} thắng vì ${descriptions[reason] || "đã thắng trận đấu"}.`;
}

function describeMoveError(reason) {
  return {
    INVALID_ACTION_FORMAT: "bot trả về dữ liệu nước đi không đúng định dạng",
    INVALID_PIECE_ID: "không tìm thấy mã quân cờ",
    PIECE_NOT_FOUND: "quân cờ không thuộc về bot đang đi",
    INVALID_DESTINATION: "ô đích không hợp lệ",
    MOVE_OUT_OF_RANGE: "quân chỉ được đi một ô",
    FRIENDLY_PIECE_BLOCKS_DESTINATION: "ô đích đang có quân cùng phe",
    OPPONENT_PIECE_BLOCKS_DESTINATION:
      "quân không thể ăn quân cùng loại hoặc bị khắc chế",
    BOT_EXECUTION_FAILED: "không thể chạy mã bot",
  }[reason] || "không xác định";
}

function formatPieceType(type) {
  return { bua: "BÚA", keo: "KÉO", bao: "BAO" }[type] || type;
}

function roomStatusLabel(status) {
  return {
    waiting: "Đang chờ người chơi",
    running: "Đang thi đấu",
    paused: "Đang tạm dừng",
    completed: "Đã kết thúc",
    failed: "Trận đấu gặp lỗi",
  }[status] || "Không xác định";
}

function formatSeconds(milliseconds) {
  return Math.ceil(Math.max(0, Number(milliseconds) || 0) / 1000);
}

function viewerTokenKey(roomId) {
  return `room-view-${roomId}`;
}

function presenceSessionKey(roomId) {
  return `room-presence-${roomId}`;
}

function roomCredentialKey(roomId) {
  return `room-credentials-${roomId}`;
}

async function copyRoomPassword() {
  const password = sessionStorage.getItem(roomCredentialKey(roomPage.roomId));
  if (!password) return;
  try {
    await navigator.clipboard.writeText(password);
    showPageMessage("Đã sao chép mật khẩu phòng.", "success");
  } catch (error) {
    showPageMessage(`Không thể sao chép mật khẩu: ${error.message}`, "error");
  }
}

function setBusy(id, isBusy, label) {
  const button = document.getElementById(id);
  if (!button) return;
  if (isBusy) {
    button.dataset.originalText = button.textContent;
    button.dataset.originalDisabled = String(button.disabled);
    button.disabled = true;
    button.textContent = label;
  } else {
    button.disabled = button.dataset.originalDisabled === "true";
    button.textContent = button.dataset.originalText || button.textContent;
    delete button.dataset.originalText;
    delete button.dataset.originalDisabled;
  }
}

function showPageMessage(message, type = "info") {
  const element = document.getElementById("pageMessage");
  element.textContent = message;
  element.className = `create-bot-message visible ${type}`;
  window.clearTimeout(showPageMessage.timer);
  showPageMessage.timer = window.setTimeout(() => {
    element.classList.remove("visible");
  }, 6_000);
}
