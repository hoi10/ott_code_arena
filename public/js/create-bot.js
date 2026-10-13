(function () {
    "use strict";

    const form = document.getElementById("createBotForm");
    if (!form) return;

    const nameInput = document.getElementById("botName");
    const languageInput = document.getElementById("botLanguage");
    const descriptionInput = document.getElementById("botDescription");
    const codeInput = document.getElementById("botCode");
    const messageBox = document.getElementById("createBotMessage");
    const submitButton = document.getElementById("submitBotBtn");
    const testButton = document.getElementById("test-code");
    const characterCount = document.getElementById("codeCharacterCount");
    const lineCount = document.getElementById("codeLineCount");
    const fileName = document.getElementById("editorFileName");
    const params = new URLSearchParams(window.location.search);
    const botId = params.get("id");
    const isEditMode = Boolean(botId);
    let protocolVersion = 2;
    const draftKey = "ott-code-arena-bot-draft";
    const starterCode = {
        javascript: `const own = input.pieces?.own || [];
const opponent = input.pieces?.opponent || [];
const captures = input.rules?.captures || {};
const occupied = new Map([...own, ...opponent].map(piece => [piece.x + "," + piece.y, piece]));

for (const piece of own) {
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const x = piece.x + dx;
      const y = piece.y + dy;
      if (x < 0 || y < 0 || x >= input.boardSize || y >= input.boardSize) continue;
      const occupant = occupied.get(x + "," + y);
      if (occupant?.ownerId === piece.ownerId) continue;
      if (occupant && captures[piece.type] !== occupant.type) continue;
      return { pieceId: piece.id, to: { x, y } };
    }
  }
}
return null;`,
        python: `import json
import sys

data = json.load(sys.stdin)
own = data.get("pieces", {}).get("own", [])
opponent = data.get("pieces", {}).get("opponent", [])
captures = data.get("rules", {}).get("captures", {})
occupied = {(piece["x"], piece["y"]): piece for piece in own + opponent}

for piece in own:
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            if dx == 0 and dy == 0:
                continue
            x = piece["x"] + dx
            y = piece["y"] + dy
            if x < 0 or y < 0 or x >= data["boardSize"] or y >= data["boardSize"]:
                continue
            occupant = occupied.get((x, y))
            if occupant and occupant.get("ownerId") == piece.get("ownerId"):
                continue
            if occupant and captures.get(piece["type"]) != occupant.get("type"):
                continue
            print(json.dumps({"pieceId": piece["id"], "to": {"x": x, "y": y}}))
            raise SystemExit

print("null")`,
        cpp: `#include <iostream>
#include <iterator>
#include <regex>
#include <string>
#include <vector>

struct Piece { std::string id, ownerId, type; int x, y; };

std::vector<Piece> readPieces(const std::string& json, const std::string& key) {
    const auto keyAt = json.find("\\\"" + key + "\\\"");
    const auto start = json.find('[', keyAt);
    const auto end = json.find(']', start);
    if (keyAt == std::string::npos || start == std::string::npos || end == std::string::npos) return {};
    const std::string list = json.substr(start, end - start + 1);
    const std::regex item(R"json(\\{\\"id\\":\\"([^\\"]+)\\",\\"ownerId\\":\\"([^\\"]+)\\",\\"type\\":\\"([^\\"]+)\\",\\"x\\":(-?[0-9]+),\\"y\\":(-?[0-9]+)\\})json");
    std::vector<Piece> pieces;
    for (std::sregex_iterator it(list.begin(), list.end(), item), last; it != last; ++it) {
        pieces.push_back({(*it)[1], (*it)[2], (*it)[3], std::stoi((*it)[4]), std::stoi((*it)[5])});
    }
    return pieces;
}

bool canCapture(const std::string& attacker, const std::string& defender) {
    return (attacker == "bua" && defender == "keo") ||
           (attacker == "keo" && defender == "bao") ||
           (attacker == "bao" && defender == "bua");
}

int main() {
    const std::string input((std::istreambuf_iterator<char>(std::cin)), {});
    const auto own = readPieces(input, "own");
    const auto opponent = readPieces(input, "opponent");
    std::vector<Piece> board = own;
    board.insert(board.end(), opponent.begin(), opponent.end());

    for (const auto& piece : own) {
        for (int dy = -1; dy <= 1; ++dy) for (int dx = -1; dx <= 1; ++dx) {
            if (dx == 0 && dy == 0) continue;
            const int x = piece.x + dx, y = piece.y + dy;
            if (x < 0 || y < 0 || x >= 9 || y >= 9) continue;
            const Piece* occupant = nullptr;
            for (const auto& other : board) if (other.x == x && other.y == y) { occupant = &other; break; }
            if (occupant && occupant->ownerId == piece.ownerId) continue;
            if (occupant && !canCapture(piece.type, occupant->type)) continue;
            std::cout << "{\\\"pieceId\\\":\\\"" << piece.id << "\\\",\\\"to\\\":{\\\"x\\\":" << x << ",\\\"y\\\":" << y << "}}";
            return 0;
        }
    }
    std::cout << "null";
}`
    };

    function showMessage(message, type) {
        messageBox.textContent = message;
        messageBox.className = "create-bot-message visible " + type;
    }

    function setBusy(button, busy, busyText) {
        if (busy) {
            button.dataset.originalText = button.textContent;
            button.disabled = true;
            button.textContent = busyText;
            return;
        }
        button.disabled = false;
        button.textContent = button.dataset.originalText || button.textContent;
    }

    function updateCodeStats() {
        const code = codeInput.value;
        characterCount.textContent = code.length.toLocaleString() + " ký tự";
        lineCount.textContent = (code.length ? code.split("\n").length : 1) + " dòng";
    }

    function updateEditorLanguage() {
        const extensions = {
            javascript: "main.js",
            cpp: "main.cpp",
            python: "main.py"
        };
        fileName.textContent = extensions[languageInput.value] || "main.txt";
    }

    function fillStarterCodeIfEmpty() {
        if (!codeInput.value.trim()) {
            codeInput.value = starterCode[languageInput.value] || "";
        }
    }

    function getVisibility() {
        return form.querySelector('input[name="visibility"]:checked')?.value === "public";
    }

    function setVisibility(isPublic) {
        const radio = form.querySelector(
            'input[name="visibility"][value="' + (isPublic ? "public" : "private") + '"]'
        );
        if (radio) radio.checked = true;
    }

    function saveDraft() {
        const draft = {
            name: nameInput.value,
            language: languageInput.value,
            description: descriptionInput.value,
            code: codeInput.value,
            visibility: getVisibility() ? "public" : "private"
        };

        try {
            localStorage.setItem(draftKey, JSON.stringify(draft));
            showMessage("Đã lưu bản nháp trên trình duyệt này.", "success");
        } catch (error) {
            showMessage("Không thể lưu bản nháp: " + error.message, "error");
        }
    }

    function restoreDraft() {
        if (isEditMode) return;

        try {
            const savedDraft = localStorage.getItem(draftKey);
            if (!savedDraft) return;

            const draft = JSON.parse(savedDraft);
            if (typeof draft.name === "string") nameInput.value = draft.name;
            if (["javascript", "cpp", "python"].includes(draft.language)) {
                languageInput.value = draft.language;
            }
            if (typeof draft.description === "string") {
                descriptionInput.value = draft.description;
            }
            if (typeof draft.code === "string") codeInput.value = draft.code;
            if (draft.visibility === "public") setVisibility(true);
        } catch (error) {
            console.warn("Không thể đọc bản nháp.", error);
        }
    }

    async function loadBot() {
        if (!isEditMode) return;
        if (!/^\d+$/.test(botId)) {
            showMessage("ID bot không hợp lệ.", "error");
            submitButton.disabled = true;
            return;
        }

        try {
            const response = await window.api.get("/bots/" + encodeURIComponent(botId));
            const bot = response?.data?.bot;
            if (!bot) throw new Error("Máy chủ không trả về dữ liệu bot.");

            nameInput.value = bot.name || "";
            descriptionInput.value = bot.description || "";
            codeInput.value = bot.sourceCode || "";
            languageInput.value = bot.language || "javascript";
            protocolVersion = bot.protocolVersion || 1;
            setVisibility(Boolean(bot.isPublic));
            try {
                const context = JSON.parse(
                    sessionStorage.getItem("ott-code-arena-playground-context") || "{}"
                );
                if (context.origin === "create" && context.botId === botId && context.sourceCode) {
                    nameInput.value = context.name || nameInput.value;
                    descriptionInput.value = context.description || descriptionInput.value;
                    codeInput.value = context.sourceCode;
                    languageInput.value = context.language || languageInput.value;
                    setVisibility(context.visibility === "public");
                }
            } catch (error) {
                console.warn("Không thể khôi phục mã đang test.", error);
            }
            updateEditorLanguage();
            updateCodeStats();
        } catch (error) {
            showMessage("Không thể tải bot: " + error.message, "error");
            submitButton.disabled = true;
        }
    }

    async function testCode() {
        if (!codeInput.value.trim()) {
            showMessage("Hãy nhập mã nguồn trước khi kiểm tra.", "error");
            return;
        }

        try {
            const draft = {
                name: nameInput.value,
                language: languageInput.value,
                description: descriptionInput.value,
                code: codeInput.value,
                visibility: getVisibility() ? "public" : "private"
            };
            localStorage.setItem(draftKey, JSON.stringify(draft));
            sessionStorage.setItem("ott-code-arena-playground-context", JSON.stringify({
                origin: "create",
                botId: botId || null,
                name: nameInput.value,
                description: descriptionInput.value,
                visibility: getVisibility() ? "public" : "private",
                language: languageInput.value,
                protocolVersion,
                sourceCode: codeInput.value
            }));
            window.location.href = "/bot-playground.html?origin=create" +
                (botId ? "&botId=" + encodeURIComponent(botId) : "");
        } catch (error) {
            showMessage("Không thể mở màn hình kiểm tra: " + error.message, "error");
        }
    }

    async function handleSubmit(event) {
        event.preventDefault();
        if (!form.reportValidity()) return;

        if (!window.api) {
            showMessage("Chưa tải được module API.", "error");
            return;
        }

        const payload = {
            name: nameInput.value.trim(),
            language: languageInput.value,
            protocolVersion,
            description: descriptionInput.value.trim(),
            sourceCode: codeInput.value,
            isPublic: getVisibility()
        };

        setBusy(submitButton, true, "Đang lưu...");
        try {
            const response = isEditMode
                ? await window.api.patch("/bots/" + encodeURIComponent(botId), payload)
                : await window.api.post("/bots", payload);
            const savedBot = response?.data?.bot;
            if (!savedBot?.id) throw new Error("Máy chủ không trả về bot đã lưu.");

            localStorage.removeItem(draftKey);
            sessionStorage.removeItem("ott-code-arena-playground-context");
            showMessage(
                isEditMode ? "Đã cập nhật bot thành công." : "Đã tạo bot thành công.",
                "success"
            );
            window.setTimeout(() => {
                window.location.href =
                    "/bots.html?id=" + encodeURIComponent(savedBot.id) +
                    "#bot-" + encodeURIComponent(savedBot.id);
            }, 500);
        } catch (error) {
            showMessage("Không thể lưu bot: " + error.message, "error");
        } finally {
            setBusy(submitButton, false);
        }
    }

    document.getElementById("saveDraftBtn").addEventListener("click", saveDraft);
    document.getElementById("reset-code").addEventListener("click", () => {
        if (!window.confirm("Bạn có chắc muốn xóa toàn bộ code hiện tại?")) return;
        codeInput.value = "";
        updateCodeStats();
        codeInput.focus();
    });
    testButton.addEventListener("click", testCode);
    languageInput.addEventListener("change", () => {
        updateEditorLanguage();
        fillStarterCodeIfEmpty();
        updateCodeStats();
    });
    codeInput.addEventListener("input", updateCodeStats);
    form.addEventListener("submit", handleSubmit);

    if (isEditMode) {
        document.getElementById("pageTitle").textContent = "Chỉnh sửa bot";
        document.getElementById("pageDescription").textContent =
            "Chỉnh sửa chiến thuật và thông tin bot.";
        document.getElementById("breadcrumbCurrent").textContent = "Chỉnh sửa bot";
        submitButton.textContent = "Lưu thay đổi";
    }

    restoreDraft();
    fillStarterCodeIfEmpty();
    updateCodeStats();
    loadBot();
})();
