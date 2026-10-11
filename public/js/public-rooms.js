"use strict";

document.addEventListener("DOMContentLoaded", loadLivePublicRooms);

async function loadLivePublicRooms() {
  const container = document.getElementById("liveRoomsList");
  if (!container || !window.api) return;

  const refresh = async () => {
    try {
      const response = await window.api.get("/rooms/public");
      const rooms = response?.data?.rooms;
      if (!Array.isArray(rooms)) {
        throw new Error("Danh sách trận đấu không hợp lệ.");
      }
      renderLivePublicRooms(
        container,
        rooms.filter((room) =>
          ["waiting", "running", "paused"].includes(room.status)
        )
      );
    } catch (error) {
      renderPublicRoomsMessage(
        container,
        `Chưa thể tải danh sách trận đấu: ${error.message}`
      );
    }
  };
  await refresh();
  window.setInterval(refresh, 15_000);
}

function renderLivePublicRooms(container, rooms) {
  container.replaceChildren();
  if (rooms.length === 0) {
    renderPublicRoomsMessage(container, "Hiện chưa có phòng công khai nào đang mở.");
    return;
  }

  for (const room of rooms) {
    const card = document.createElement("article");
    card.className = "public-room-card";

    const status = document.createElement("span");
    status.className = "public-room-status";
    const dot = document.createElement("span");
    dot.setAttribute("aria-hidden", "true");
    status.append(
      dot,
      document.createTextNode(room.status === "waiting" ? " ĐANG CHỜ" : " TRỰC TIẾP")
    );

    const name = document.createElement("h3");
    name.textContent = room.name;

    const details = document.createElement("p");
    const roomState = {
      waiting: "Đang chờ người chơi",
      paused: "Đang tạm dừng",
      running: "Đang thi đấu",
    }[room.status] || "Đang mở";
    details.textContent = `${roomState} · ${room.players?.length ?? 0}/2 người chơi`;

    const link = document.createElement("a");
    link.className = "btn btn-primary";
    link.href = `/matches.html?id=${encodeURIComponent(room.id)}`;
    link.textContent = room.status === "waiting" ? "Xem sảnh chờ" : "Vào xem trận";

    card.append(status, name, details, link);
    container.append(card);
  }
}

function renderPublicRoomsMessage(container, message) {
  const paragraph = document.createElement("p");
  paragraph.className = "public-rooms-message";
  paragraph.textContent = message;
  container.replaceChildren(paragraph);
}
