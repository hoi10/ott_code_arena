(function () {
  "use strict";

  const BOARD_SIZE = 9;
  const contextKey = "ott-code-arena-playground-context";
  const params = new URLSearchParams(window.location.search);
  const origin = params.get("origin") || "submissions";
  const botId = params.get("botId");
  const board = document.getElementById("board");
  const codeInput = document.getElementById("playgroundCode");
  const languageInput = document.getElementById("playgroundLanguage");
  const pieceMenu = document.getElementById("pieceMenu");
  const pieceMenuBackdrop = document.getElementById("pieceMenuBackdrop");
  const messageBox = document.getElementById("playgroundMessage");
  const resultBox = document.getElementById("testResult");
  const placementHint = document.getElementById("placementHint");
  const backLink = document.getElementById("backLink");
  let pieces = [];
  let selectedCell = null;
  let running = false;
  let testHistory = [];
  let protocolVersion = 2;

  const starterCode = {
    javascript: "const own = input.pieces?.own || [];\nconst opponent = input.pieces?.opponent || [];\nconst captures = input.rules?.captures || {};\nconst occupied = new Map([...own, ...opponent].map(piece => [piece.x + \",\" + piece.y, piece]));\nfor (const piece of own) {\n  for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {\n    if (dx === 0 && dy === 0) continue;\n    const x = piece.x + dx; const y = piece.y + dy;\n    if (x < 0 || y < 0 || x >= input.boardSize || y >= input.boardSize) continue;\n    const occupant = occupied.get(x + \",\" + y);\n    if (occupant?.ownerId === piece.ownerId) continue;\n    if (occupant && captures[piece.type] !== occupant.type) continue;\n    return { pieceId: piece.id, to: { x, y } };\n  }\n}\nreturn null;",
    python: "import json\nimport sys\n\ndata = json.load(sys.stdin)\nown = data.get(\"pieces\", {}).get(\"own\", [])\nopponent = data.get(\"pieces\", {}).get(\"opponent\", [])\ncaptures = data.get(\"rules\", {}).get(\"captures\", {})\noccupied = {(piece[\"x\"], piece[\"y\"]): piece for piece in own + opponent}\nfor piece in own:\n    for dy in (-1, 0, 1):\n        for dx in (-1, 0, 1):\n            if dx == 0 and dy == 0: continue\n            x = piece[\"x\"] + dx; y = piece[\"y\"] + dy\n            if x < 0 or y < 0 or x >= data[\"boardSize\"] or y >= data[\"boardSize\"]: continue\n            occupant = occupied.get((x, y))\n            if occupant and occupant.get(\"ownerId\") == piece.get(\"ownerId\"): continue\n            if occupant and captures.get(piece[\"type\"]) != occupant.get(\"type\"): continue\n            print(json.dumps({\"pieceId\": piece[\"id\"], \"to\": {\"x\": x, \"y\": y}}))\n            raise SystemExit\nprint(\"null\")",
    cpp: `#include <iostream>
#include <iterator>
#include <regex>
#include <string>
#include <vector>
struct Piece { std::string id, ownerId, type; int x, y; };
std::vector<Piece> readPieces(const std::string& json, const std::string& key) {
  const auto keyAt = json.find("\\\"" + key + "\\\""); const auto start = json.find('[', keyAt); const auto end = json.find(']', start);
  if (keyAt == std::string::npos || start == std::string::npos || end == std::string::npos) return {};
  const std::regex item(R"json(\\{\\"id\\":\\"([^\\"]+)\\",\\"ownerId\\":\\"([^\\"]+)\\",\\"type\\":\\"([^\\"]+)\\",\\"x\\":(-?[0-9]+),\\"y\\":(-?[0-9]+)\\})json");
  std::vector<Piece> pieces; const std::string list = json.substr(start, end - start + 1);
  for (std::sregex_iterator it(list.begin(), list.end(), item), last; it != last; ++it) pieces.push_back({(*it)[1], (*it)[2], (*it)[3], std::stoi((*it)[4]), std::stoi((*it)[5])});
  return pieces;
}
bool canCapture(const std::string& a, const std::string& d) { return (a == "bua" && d == "keo") || (a == "keo" && d == "bao") || (a == "bao" && d == "bua"); }
int main() {
  const std::string input((std::istreambuf_iterator<char>(std::cin)), {}); const auto own = readPieces(input, "own"); const auto opponent = readPieces(input, "opponent");
  std::vector<Piece> board = own; board.insert(board.end(), opponent.begin(), opponent.end());
  for (const auto& piece : own) for (int dy = -1; dy <= 1; ++dy) for (int dx = -1; dx <= 1; ++dx) {
    if (dx == 0 && dy == 0) continue; const int x = piece.x + dx, y = piece.y + dy; if (x < 0 || y < 0 || x >= 9 || y >= 9) continue;
    const Piece* occupant = nullptr; for (const auto& other : board) if (other.x == x && other.y == y) { occupant = &other; break; }
    if (occupant && occupant->ownerId == piece.ownerId) continue; if (occupant && !canCapture(piece.type, occupant->type)) continue;
    std::cout << "{\\\"pieceId\\\":\\\"" << piece.id << "\\\",\\\"to\\\":{\\\"x\\\":" << x << ",\\\"y\\\":" << y << "}}"; return 0;
  }
  std::cout << "null";
}`
  };

  function setMessage(text, type) {
    messageBox.textContent = text;
    messageBox.className = `playground-message ${type || ""}`;
    messageBox.hidden = !text;
  }

  function findPiece(x, y) {
    return pieces.find((piece) => piece.x === x && piece.y === y);
  }

  function renderBoard({ hiddenPieceId = null } = {}) {
    board.replaceChildren();
    for (let y = 0; y < BOARD_SIZE; y += 1) {
      for (let x = 0; x < BOARD_SIZE; x += 1) {
        const cell = document.createElement("button");
        cell.type = "button";
        cell.className = "board-cell";
        if (x === 0 && y === BOARD_SIZE - 1) cell.classList.add("home-own");
        if (x === BOARD_SIZE - 1 && y === 0) cell.classList.add("home-opponent");
        cell.dataset.x = String(x);
        cell.dataset.y = String(y);
        cell.setAttribute("aria-label", `Ô ${String.fromCharCode(97 + x)}${y + 1}`);
        const coordinate = document.createElement("span");
        coordinate.className = "cell-coordinate";
        coordinate.textContent = `${String.fromCharCode(97 + x)}${y + 1}`;
        cell.append(coordinate);
        const piece = findPiece(x, y);
        if (piece && piece.id !== hiddenPieceId) {
          const token = document.createElement("span");
          token.className = `piece-token ${piece.side} ${piece.type}`;
          token.title = `${piece.side === "own" ? "Quân bạn" : "Quân đối thủ"} · ${piece.type}`;
          cell.append(token);
        }
        cell.addEventListener("click", () => openPieceMenu(x, y));
        board.append(cell);
      }
    }
    placementHint.textContent = pieces.some((piece) => piece.side === "own")
      ? "Đã đặt quân bạn. Bấm ô trống để thêm quân đối thủ; bấm quân đã đặt để xoá."
      : "Hãy đặt đúng 1 quân của bạn trước.";
  }

  function openPieceMenu(x, y) {
    selectedCell = { x, y };
    const existing = findPiece(x, y);
    const ownPlaced = pieces.some((piece) => piece.side === "own");
    document.getElementById("pieceMenuTitle").textContent = existing
      ? "Quân đã đặt — bạn có thể xoá để đổi thế cờ"
      : ownPlaced ? "Chọn quân đối thủ" : "Chọn quân của bạn";
    document.getElementById("pieceMenuDescription").textContent = existing
      ? "Bạn có thể xoá quân này rồi chọn lại một ô khác."
      : ownPlaced
        ? "Quân tiếp theo sẽ thuộc về phía đối thủ."
        : "Đây là quân duy nhất thuộc về bot của bạn trong thế cờ này.";
    document.getElementById("removePieceBtn").hidden = !existing;
    document.querySelectorAll("[data-piece-type]").forEach((button) => {
      button.disabled = Boolean(existing) || (!ownPlaced && pieces.length > 0);
    });
    pieceMenu.hidden = false;
    pieceMenuBackdrop.hidden = false;
  }

  function closePieceMenu() {
    pieceMenu.hidden = true;
    pieceMenuBackdrop.hidden = true;
    selectedCell = null;
  }

  function addPiece(type) {
    if (!selectedCell || findPiece(selectedCell.x, selectedCell.y)) return;
    const ownPlaced = pieces.some((piece) => piece.side === "own");
    pieces.push({
      side: ownPlaced ? "opponent" : "own",
      type,
      x: selectedCell.x,
      y: selectedCell.y
    });
    closePieceMenu();
    renderBoard();
  }

  function removeSelectedPiece() {
    if (!selectedCell) return;
    pieces = pieces.filter((piece) => !(piece.x === selectedCell.x && piece.y === selectedCell.y));
    closePieceMenu();
    renderBoard();
  }

  function clearBoard() {
    pieces = [];
    setMessage("", "");
    closePieceMenu();
    renderBoard();
  }

  function addHistory(submission, message, type) {
    testHistory.unshift({
      submission,
      message,
      type,
      at: new Date()
    });
    renderTestHistory();
  }

  function renderTestHistory() {
    const history = document.getElementById("testHistory");
    history.replaceChildren();
    if (!testHistory.length) {
      history.className = "test-history-empty";
      history.textContent = "Chưa có lần test nào.";
      return;
    }
    history.className = "test-history";
    for (const entry of testHistory) {
      const item = document.createElement("article");
      item.className = `test-history-item ${entry.type}`;
      const heading = document.createElement("div");
      heading.className = "test-history-item-heading";
      const title = document.createElement("span");
      title.textContent = entry.type === "success" ? "Test thành công" : "Test chưa hợp lệ";
      const time = document.createElement("time");
      time.textContent = entry.at.toLocaleTimeString("vi-VN");
      heading.append(title, time);
      const detail = document.createElement("p");
      detail.textContent = entry.message;
      const output = document.createElement("pre");
      output.textContent = JSON.stringify(
        entry.submission?.result?.action || { reason: entry.submission?.result?.reason },
        null,
        2
      );
      item.append(heading, detail, output);
      history.append(item);
    }
  }

  function animateMove(beforePieces, afterPieces, action) {
    const from = beforePieces.find((piece) => piece.side === "own");
    const to = afterPieces.find((piece) => piece.id === action?.pieceId) || (
      action?.to && Number.isInteger(action.to.x) && Number.isInteger(action.to.y)
        ? { ...from, x: action.to.x, y: action.to.y }
        : null
    );
    if (!from || !to || from.x === to.x && from.y === to.y) {
      renderBoard();
      return Promise.resolve();
    }

    renderBoard({ hiddenPieceId: action.pieceId });
    const boardSize = board.getBoundingClientRect().width;
    const cellSize = boardSize / BOARD_SIZE;
    const animation = document.createElement("span");
    animation.className = `piece-token own ${from.type} move-animation`;
    animation.style.left = `${from.x * cellSize + cellSize * .19}px`;
    animation.style.top = `${from.y * cellSize + cellSize * .22}px`;
    animation.style.width = `${cellSize * .62}px`;
    animation.style.height = `${cellSize * .56}px`;
    animation.style.setProperty("--move-x", `${(to.x - from.x) * cellSize}px`);
    animation.style.setProperty("--move-y", `${(to.y - from.y) * cellSize}px`);
    board.append(animation);

    return new Promise((resolve) => {
      requestAnimationFrame(() => {
        animation.classList.add("moving");
      });
      window.setTimeout(() => {
        animation.remove();
        renderBoard();
        resolve();
      }, 720);
    });
  }

  function applyActionForDisplay(beforePieces, action) {
    if (!action?.to || !Number.isInteger(action.to.x) || !Number.isInteger(action.to.y)) {
      return beforePieces;
    }

    const ownPiece = beforePieces.find((piece) => piece.side === "own");
    if (!ownPiece) return beforePieces.map((piece) => ({ ...piece }));

    return beforePieces
      .filter((piece) => piece.side === "own" || piece.x !== action.to.x || piece.y !== action.to.y)
      .map((piece) => piece === ownPiece
        ? { ...piece, id: action.pieceId || piece.id || "1-1", x: action.to.x, y: action.to.y }
        : { ...piece }
      );
  }

  function isSingleStep(beforePieces, action) {
    const ownPiece = beforePieces.find(
      (piece) => piece.side === "own" && piece.id === action?.pieceId
    ) || beforePieces.find((piece) => piece.side === "own");
    if (!ownPiece || !action?.to) return false;
    return Math.max(
      Math.abs(action.to.x - ownPiece.x),
      Math.abs(action.to.y - ownPiece.y)
    ) === 1;
  }

  function isConsistentServerState(beforePieces, serverPieces, action) {
    if (!Array.isArray(serverPieces) || !isSingleStep(beforePieces, action)) return false;
    const movedPiece = serverPieces.find((piece) => piece.id === action.pieceId);
    return Boolean(
      movedPiece &&
      movedPiece.x === action.to.x &&
      movedPiece.y === action.to.y
    );
  }

  function backUrl() {
    if (origin === "create") return `/create-bot.html${botId ? `?id=${encodeURIComponent(botId)}` : ""}`;
    if (origin === "bots") return `/bots.html${botId ? `?id=${encodeURIComponent(botId)}` : ""}`;
    return "/submissions.html";
  }

  function showResult(submission) {
    const result = submission.result || {};
    const success = submission.status === "accepted";
      const detail = success && result.action?.to
      ? `Bot đã di chuyển quân ${result.action.pieceId} đến ô (${result.action.to.x}, ${result.action.to.y}).`
      : describeReason(result.reason || result.error);
    addHistory(submission, detail, success ? "success" : "error");
    setMessage(detail, success ? "success" : "error");
  }

  function describeReason(reason) {
    const messages = {
      TEST_REQUIRES_ONE_OWN_PIECE: "Hãy đặt đúng một quân của bạn trước khi test.",
      TEST_PIECES_OVERLAP: "Các quân cờ không được nằm cùng một ô.",
      INVALID_ACTION_FORMAT: "Bot trả về nước đi sai cấu trúc.",
      PIECE_NOT_FOUND: "Bot chọn quân không thuộc về mình.",
      INVALID_DESTINATION: "Bot chọn ô đích không hợp lệ.",
      MOVE_OUT_OF_RANGE: "Quân chỉ được đi tối đa một ô mỗi lượt.",
      FRIENDLY_PIECE_BLOCKS_DESTINATION: "Ô đích đang có quân cùng phe.",
      OPPONENT_PIECE_BLOCKS_DESTINATION: "Quân này không thể ăn quân đối thủ ở ô đích.",
      BOT_EXECUTION_TIMEOUT: "Bot chạy quá thời gian cho phép.",
      BOT_OUTPUT_LIMIT_EXCEEDED: "Bot trả về quá nhiều dữ liệu.",
      BOT_EXECUTION_FAILED: "Bot gặp lỗi khi thực thi."
    };
    return messages[reason] || reason || "Không có thêm thông tin.";
  }

  async function runTest() {
    if (running) return;
    if (pieces.filter((piece) => piece.side === "own").length !== 1) {
      setMessage("Bạn cần đặt đúng một quân của mình trước khi test.", "error");
      return;
    }
    if (!codeInput.value.trim()) {
      setMessage("Hãy nhập mã nguồn bot trước khi test.", "error");
      return;
    }
    running = true;
    const button = document.getElementById("testBotBtn");
    button.disabled = true;
    button.textContent = "Đang chạy...";
    setMessage("", "");
    try {
      const response = await window.api.post("/submissions", {
        botId: botId ? Number(botId) : undefined,
        sourceCode: codeInput.value,
        language: languageInput.value,
        protocolVersion,
        testState: { pieces: pieces.map(({ side, type, x, y }) => ({ side, type, x, y })) }
      });
      const submission = response?.data?.submission;
      if (!submission) throw new Error("Máy chủ không trả về kết quả test.");
      if (submission.status === "accepted" && submission.result?.action) {
        const beforePieces = pieces.map((piece) => ({ ...piece, id: piece.id }));
        const serverBeforePieces = submission.result.stateBefore?.pieces;
        const animationBefore = Array.isArray(serverBeforePieces)
          ? serverBeforePieces.map((piece) => ({
              ...piece,
              side: piece.ownerId === "1" ? "own" : "opponent"
            }))
          : beforePieces;
        const serverPieces = submission.result.stateAfter?.pieces;
        const displayPieces = isConsistentServerState(animationBefore, serverPieces, submission.result.action)
          ? serverPieces
          : applyActionForDisplay(animationBefore, submission.result.action);
        pieces = displayPieces.map((piece) => ({
          id: piece.id,
          side: piece.side || (piece.ownerId === "1" ? "own" : "opponent"),
          type: piece.type,
          x: piece.x,
          y: piece.y
        }));
        await animateMove(animationBefore, pieces, submission.result.action);
        setMessage("Test thành công: bot đã hoàn tất một lượt.", "success");
      } else {
        setMessage(describeReason(submission.result?.reason || submission.result?.error), "error");
      }
      showResult(submission);
    } catch (error) {
      const detail = `Không thể chạy test: ${error.message}`;
      setMessage(detail, "error");
      addHistory({ status: "failed", result: { error: error.message } }, detail, "error");
    } finally {
      running = false;
      button.disabled = false;
      button.textContent = "Test 1 lượt";
    }
  }

  async function loadContext() {
    let context = {};
    try { context = JSON.parse(sessionStorage.getItem(contextKey) || "{}"); } catch (_) { context = {}; }
    if (botId) {
      const response = await window.api.get(`/bots/${encodeURIComponent(botId)}`);
      const bot = response?.data?.bot;
      if (!bot) throw new Error("Không tìm thấy bot.");
      const hasUnsavedCreateDraft = context.origin === "create" && context.sourceCode;
      codeInput.value = hasUnsavedCreateDraft ? context.sourceCode : (bot.sourceCode || "");
      languageInput.value = hasUnsavedCreateDraft
        ? context.language || "javascript"
        : bot.language || "javascript";
      protocolVersion = hasUnsavedCreateDraft ? 2 : (bot.protocolVersion || 1);
      document.getElementById("botSourceHint").textContent = `Đang test bot đã lưu: ${bot.name || `#${bot.id}`}.`;
    } else {
      codeInput.value = context.sourceCode || "";
      languageInput.value = context.language || "javascript";
      protocolVersion = context.protocolVersion || 2;
    }
    if (!codeInput.value.trim()) codeInput.value = starterCode[languageInput.value];
    backLink.href = backUrl();
  }

  document.querySelectorAll("[data-piece-type]").forEach((button) => {
    button.addEventListener("click", () => addPiece(button.dataset.pieceType));
  });
  document.getElementById("removePieceBtn").addEventListener("click", removeSelectedPiece);
  document.getElementById("closePieceMenuBtn").addEventListener("click", closePieceMenu);
  pieceMenuBackdrop.addEventListener("click", closePieceMenu);
  document.getElementById("clearBoardBtn").addEventListener("click", clearBoard);
  document.getElementById("clearHistoryBtn").addEventListener("click", () => {
    testHistory = [];
    renderTestHistory();
  });
  document.getElementById("testBotBtn").addEventListener("click", runTest);
  languageInput.addEventListener("change", () => {
    if (!codeInput.value.trim()) codeInput.value = starterCode[languageInput.value];
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !pieceMenu.hidden) closePieceMenu();
  });
  renderBoard();
  loadContext().catch((error) => setMessage(`Không thể tải mã bot: ${error.message}`, "error"));
})();
