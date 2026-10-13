"use strict";

(function initializeSocialPresence() {
  if (!localStorage.getItem("token")) return;

  const presenceKey = "social-presence-session";
  const leaderKey = "social-notifications-leader";
  const tabKey = "social-notifications-tab";
  const sessionId =
    localStorage.getItem(presenceKey) ||
    (window.crypto?.randomUUID
      ? window.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
  localStorage.setItem(presenceKey, sessionId);
  const tabId =
    sessionStorage.getItem(tabKey) ||
    (window.crypto?.randomUUID
      ? window.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
  sessionStorage.setItem(tabKey, tabId);

  let polling = false;
  let notificationTimer = null;
  let heartbeatTimer = null;
  let lastNotificationPollAt = 0;
  let lastHeartbeatAt = 0;
  let promptOpen = false;
  const NOTIFICATION_POLL_MS = 5_000;
  const HEARTBEAT_INTERVAL_MS = 15_000;
  const LEADER_LEASE_MS = 12_000;

  function readLeader() {
    try {
      return JSON.parse(localStorage.getItem(leaderKey) || "null");
    } catch {
      return null;
    }
  }

  function isLeader() {
    const leader = readLeader();
    return Boolean(leader && leader.tabId === tabId && leader.expiresAt > Date.now());
  }

  function becomeLeader(force = false) {
    if (document.visibilityState !== "visible") return false;
    const currentLeader = readLeader();
    if (
      !force &&
      currentLeader &&
      currentLeader.expiresAt > Date.now() &&
      currentLeader.tabId !== tabId
    ) {
      return false;
    }
    localStorage.setItem(
      leaderKey,
      JSON.stringify({ tabId, expiresAt: Date.now() + LEADER_LEASE_MS })
    );
    return true;
  }

  function releaseLeader() {
    if (readLeader()?.tabId === tabId) localStorage.removeItem(leaderKey);
  }
  const handled = new Set();
  const skippedChallengeKeyPrefix = "ott-skipped-duel-challenge:";
  const toast = document.createElement("div");
  toast.className = "social-toast";
  toast.setAttribute("role", "status");
  toast.setAttribute("aria-live", "polite");
  toast.hidden = true;
  document.body.append(toast);

  const dialog = document.createElement("dialog");
  dialog.className = "social-dialog";
  dialog.innerHTML = `
    <form method="dialog" class="social-dialog-content">
      <h2 class="social-dialog-title"></h2>
      <p class="social-dialog-message"></p>
      <div class="social-dialog-actions"></div>
    </form>`;
  dialog.addEventListener("cancel", (event) => event.preventDefault());
  document.body.append(dialog);

  function notify(message, isError = false) {
    toast.textContent = message;
    toast.classList.toggle("error", isError);
    toast.hidden = false;
    window.clearTimeout(notify.timer);
    notify.timer = window.setTimeout(() => {
      toast.hidden = true;
    }, 6_000);
  }

  window.showSocialToast = notify;

  function showDialog(title, message, actions) {
    if (promptOpen) return false;
    promptOpen = true;
    dialog.querySelector(".social-dialog-title").textContent = title;
    dialog.querySelector(".social-dialog-message").textContent = message;
    const actionContainer = dialog.querySelector(".social-dialog-actions");
    actionContainer.replaceChildren();
    for (const { label, primary, action } of actions) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = primary ? "btn btn-primary" : "btn btn-secondary";
      button.textContent = label;
      button.addEventListener("click", async () => {
        button.disabled = true;
        try {
          await action();
          if (dialog.open) dialog.close();
        } catch (error) {
          notify(error.message, true);
          button.disabled = false;
        }
      });
      actionContainer.append(button);
    }
    dialog.addEventListener(
      "close",
      () => {
        promptOpen = false;
      },
      { once: true }
    );
    dialog.showModal();
    return true;
  }

  async function sendHeartbeat() {
    if (document.visibilityState !== "visible" || !isLeader()) return;
    const now = Date.now();
    if (now - lastHeartbeatAt < HEARTBEAT_INTERVAL_MS) return;
    lastHeartbeatAt = now;
    await window.api.post("/friends/presence", { sessionId });
  }

  async function pollNotifications() {
    if (polling || document.visibilityState !== "visible" || !isLeader()) return;
    becomeLeader();
    const now = Date.now();
    if (now - lastNotificationPollAt < NOTIFICATION_POLL_MS) return;
    polling = true;
    lastNotificationPollAt = now;
    try {
      await sendHeartbeat();
      const response = await window.api.get("/friends/notifications");
      const data = response?.data;
      if (!data) throw new Error("Máy chủ trả về thông báo xã hội không hợp lệ.");
      await processNotifications(data);
    } catch (error) {
      if (error.status !== 401) {
        console.error("Không thể cập nhật trạng thái bạn bè:", error);
      }
    } finally {
      polling = false;
    }
  }

  function scheduleNotificationPoll(delay = NOTIFICATION_POLL_MS) {
    window.clearTimeout(notificationTimer);
    if (document.visibilityState !== "visible" || !isLeader()) return;
    notificationTimer = window.setTimeout(async () => {
      await pollNotifications();
      scheduleNotificationPoll();
    }, delay);
  }

  function scheduleHeartbeat() {
    window.clearTimeout(heartbeatTimer);
    if (document.visibilityState !== "visible" || !isLeader()) return;
    heartbeatTimer = window.setTimeout(async () => {
      try {
        await sendHeartbeat();
      } finally {
        scheduleHeartbeat();
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  async function processNotifications(data) {
    if (promptOpen) return;
    for (const invitation of data.invitations ?? []) {
      if (handled.has(`invitation-${invitation.id}`)) continue;
      const roomInvite = invitation.kind === "room";
      const shown = showDialog(
        roomInvite ? "Lời mời vào phòng" : "Lời mời thi đấu",
        roomInvite
          ? `${invitation.sender.username} mời bạn vào phòng "${invitation.room?.name ?? ""}". Lời mời có hiệu lực trong 10 giây.`
          : `${invitation.sender.username} mời bạn thi đấu. Lời mời có hiệu lực trong 10 giây.`,
        [
          {
            label: "Chấp nhận",
            primary: true,
            action: async () => {
              const endpoint = roomInvite
                ? `/friends/room-invitations/${invitation.id}/respond`
                : `/friends/invitations/${invitation.id}/respond`;
              const response = await window.api.post(endpoint, { accept: true });
              handled.add(`invitation-${invitation.id}`);
              if (roomInvite) {
                window.location.href = `/matches.html?id=${encodeURIComponent(response?.data?.roomId)}`;
              } else {
                notify("Đã chấp nhận lời mời. Người mời đang tạo phòng đấu.");
              }
            },
          },
          {
            label: "Từ chối",
            action: async () => {
              const endpoint = roomInvite
                ? `/friends/room-invitations/${invitation.id}/respond`
                : `/friends/invitations/${invitation.id}/respond`;
              await window.api.post(endpoint, { accept: false });
              handled.add(`invitation-${invitation.id}`);
            },
          },
        ]
      );
      if (shown) return;
    }

    for (const challenge of data.completedChallenges ?? []) {
      if (handled.has(`completed-${challenge.id}`)) continue;
      handled.add(`completed-${challenge.id}`);
      await window.api.post(
        `/friends/invitations/${challenge.id}/room-ready`
      );
      notify(`${challenge.sender.username} đã tạo phòng "${challenge.room.name}". Đang vào phòng.`);
      window.location.href = `/matches.html?id=${encodeURIComponent(challenge.room.id)}`;
      return;
    }

    for (const challenge of data.acceptedChallenges ?? []) {
      if (handled.has(`accepted-${challenge.id}`)) continue;
      handled.add(`accepted-${challenge.id}`);
      if (sessionStorage.getItem(`${skippedChallengeKeyPrefix}${challenge.id}`)) {
        continue;
      }
      const current = new URL(window.location.href);
      if (
        current.pathname.endsWith("/matches.html") &&
        current.searchParams.get("createChallenge") === String(challenge.id)
      ) {
        continue;
      }
      notify(`${challenge.receiver.username} đã chấp nhận lời mời. Hãy tạo phòng.`);
      window.location.href = `/matches.html?createChallenge=${encodeURIComponent(challenge.id)}`;
      return;
    }

    for (const request of data.friendRequests ?? []) {
      if (handled.has(`friend-${request.id}`)) continue;
      const shown = showDialog(
        "Lời mời kết bạn",
        `${request.sender.username} muốn kết bạn với bạn.`,
        [
          {
            label: "Chấp nhận",
            primary: true,
            action: async () => {
              await window.api.post(`/friends/requests/${request.id}/respond`, {
                accept: true,
              });
              handled.add(`friend-${request.id}`);
              notify(`Hai bạn đã kết bạn với ${request.sender.username}.`);
            },
          },
          {
            label: "Từ chối",
            action: async () => {
              await window.api.post(`/friends/requests/${request.id}/respond`, {
                accept: false,
              });
              handled.add(`friend-${request.id}`);
            },
          },
        ]
      );
      if (shown) return;
    }
  }

  becomeLeader();
  void pollNotifications().finally(() => {
    scheduleNotificationPoll();
    scheduleHeartbeat();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      becomeLeader(true);
      void pollNotifications().finally(() => {
        scheduleNotificationPoll(0);
        scheduleHeartbeat();
      });
      return;
    }
    releaseLeader();
    window.clearTimeout(notificationTimer);
    window.clearTimeout(heartbeatTimer);
  });
  window.addEventListener("focus", () => {
    becomeLeader(true);
    if (Date.now() - lastNotificationPollAt >= NOTIFICATION_POLL_MS) {
      void pollNotifications().finally(() => scheduleNotificationPoll());
    }
  });
  window.addEventListener("pagehide", () => {
    releaseLeader();
    window.clearTimeout(notificationTimer);
    window.clearTimeout(heartbeatTimer);
  });
})();
