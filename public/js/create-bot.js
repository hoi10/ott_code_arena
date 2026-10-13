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
    const draftKey = "ott-code-arena-bot-draft";
    const starterCode = {
        javascript: `const moves = input.legalMoves || [];
if (!moves.length) return null;
return { pieceId: moves[0].pieceId, to: moves[0].to };`,
        python: `import json
import sys

data = json.load(sys.stdin)
moves = data.get("legalMoves", [])
if not moves:
    print("null")
else:
    move = moves[0]
    print(json.dumps({"pieceId": move["pieceId"], "to": move["to"]}))`,
        cpp: `#include <iostream>
#include <iterator>
#include <string>

int main() {
    std::string input((std::istreambuf_iterator<char>(std::cin)), {});
    const auto legalMoves = input.find("\\\"legalMoves\\\"");
    const auto listStart = input.find('[', legalMoves);
    const auto firstToken = input.find_first_not_of(" \\t\\r\\n", listStart + 1);
    if (listStart == std::string::npos || firstToken == std::string::npos ||
        input[firstToken] == ']') {
        std::cout << "null";
        return 0;
    }
    const auto firstObject = firstToken;
    const auto pieceKey = input.find("\\\"pieceId\\\"", firstObject);
    const auto pieceStart = input.find('\\\"', pieceKey + 10) + 1;
    const auto pieceEnd = input.find('\\\"', pieceStart);
    const auto xKey = input.find("\\\"x\\\"", pieceEnd);
    const auto xStart = input.find(':', xKey) + 1;
    const auto xEnd = input.find(',', xStart);
    const auto yKey = input.find("\\\"y\\\"", xEnd);
    const auto yStart = input.find(':', yKey) + 1;
    const auto yEnd = input.find_first_of("},", yStart);
    if (pieceKey == std::string::npos || pieceEnd == std::string::npos ||
        xKey == std::string::npos || yKey == std::string::npos) {
        std::cout << "null";
        return 0;
    }
    std::cout << "{\\\"pieceId\\\":\\\"" << input.substr(pieceStart, pieceEnd - pieceStart)
              << "\\\",\\\"to\\\":{\\\"x\\\":" << input.substr(xStart, xEnd - xStart)
              << ",\\\"y\\\":" << input.substr(yStart, yEnd - yStart) << "}}";
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
            setVisibility(Boolean(bot.isPublic));
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

        setBusy(testButton, true, "Đang kiểm tra...");
        try {
            const response = await window.api.post("/submissions", {
                language: languageInput.value,
                sourceCode: codeInput.value
            });
            const submission = response?.data?.submission;
            const result = submission?.result;
            if (!submission || !result) {
                throw new Error("Máy chủ không trả về kết quả kiểm tra.");
            }

            if (submission.status === "accepted") {
                showMessage(
                    "Mã chạy thành công và đã lưu vào lịch sử. Nước đi mẫu: quân " +
                    result.action.pieceId + " đến " + result.action.to.name + ".",
                    "success"
                );
            } else if (submission.status === "rejected") {
                showMessage(
                    "Mã chạy được nhưng nước đi không hợp lệ (" +
                    result.reason + "). Hãy trả về { pieceId, to: { x, y } }.",
                    "error"
                );
            } else {
                showMessage(
                    "Không thể chạy bot: " +
                    (result.error || "Đã xảy ra lỗi khi kiểm tra.") +
                    ". Lượt kiểm tra đã được lưu vào lịch sử.",
                    "error"
                );
            }
        } catch (error) {
            showMessage("Không thể kiểm tra mã bot: " + error.message, "error");
        } finally {
            setBusy(testButton, false);
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
