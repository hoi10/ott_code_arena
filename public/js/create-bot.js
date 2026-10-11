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
    const starterCode = [
        "const moves = input.legalMoves || [];",
        "",
        "// Ưu tiên ăn quân; nếu chưa có thì tiến gần nhà đối phương.",
        "const bestMove = [...moves].sort((a, b) => {",
        "  const captureA = a.capturePieceId ? 1 : 0;",
        "  const captureB = b.capturePieceId ? 1 : 0;",
        "  if (captureA !== captureB) return captureB - captureA;",
        "",
        "  const target = input.target;",
        "  const distanceA = Math.abs(a.to.x - target.x) + Math.abs(a.to.y - target.y);",
        "  const distanceB = Math.abs(b.to.x - target.x) + Math.abs(b.to.y - target.y);",
        "  return distanceA - distanceB;",
        "})[0];",
        "",
        "if (!bestMove) return null;",
        "return { pieceId: bestMove.pieceId, to: bestMove.to };"
    ].join("\n");

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
            if (!savedDraft) {
                codeInput.value = starterCode;
                return;
            }

            const draft = JSON.parse(savedDraft);
            if (typeof draft.name === "string") nameInput.value = draft.name;
            if (typeof draft.description === "string") {
                descriptionInput.value = draft.description;
            }
            if (typeof draft.code === "string") codeInput.value = draft.code;
            if (draft.visibility === "public") setVisibility(true);
        } catch (error) {
            console.warn("Không thể đọc bản nháp.", error);
            codeInput.value = starterCode;
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
            languageInput.value = "javascript";
            setVisibility(Boolean(bot.isPublic));
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
                language: languageInput.value || "javascript",
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
            language: "javascript",
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
    updateCodeStats();
    loadBot();
})();
