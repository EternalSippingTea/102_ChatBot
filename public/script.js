const chatForm = document.getElementById("chat-form");
const userInput = document.getElementById("user-input");
const chatBox = document.getElementById("chat-box");

const messages = [];

function addMessage(text, sender) {
    const message = document.createElement("div");
    message.classList.add("message", sender);

    const content = document.createElement("div");
    content.classList.add("message-content");
    content.textContent = text;

    message.appendChild(content);
    chatBox.appendChild(message);
    chatBox.scrollTop = chatBox.scrollHeight;
    return content;
}

chatForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const message = userInput.value.trim();
    if (!message) {
        return;
    }

    addMessage(message, "user");
    messages.push({ role: "user", content: message });

    userInput.value = "";
    userInput.disabled = true;

    const button = chatForm.querySelector("button");
    button.disabled = true;
    button.textContent = "Menunggu...";

    const botContent = addMessage("", "bot");
    let botResponse = "";

    try {
        const response = await fetch("/api/chat", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ messages })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: "Terjadi kesalahan." }));
            throw new Error(errorData.error || "Terjadi kesalahan.");
        }

        const reader = response.body?.getReader();
        if (!reader) {
            throw new Error("Tidak ada data streaming dari server.");
        }

        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                break;
            }

            buffer += decoder.decode(value, { stream: true });
            const parts = buffer.split("\n\n");
            buffer = parts.pop() || "";

            for (const part of parts) {
                const lines = part.split("\n");

                for (const line of lines) {
                    const trimmedLine = line.trim();
                    if (!trimmedLine || !trimmedLine.startsWith("data:")) {
                        continue;
                    }

                    const data = trimmedLine.slice(5).trim();
                    if (data === "[DONE]") {
                        continue;
                    }

                    try {
                        const json = JSON.parse(data);
                        const token = json?.choices?.[0]?.delta?.content;

                        if (typeof token === "string") {
                            botResponse += token;
                            botContent.textContent = botResponse;
                            chatBox.scrollTop = chatBox.scrollHeight;
                        }
                    } catch (error) {
                        console.error("Gagal membaca token:", error);
                    }
                }
            }
        }

        messages.push({ role: "assistant", content: botResponse });
    } catch (error) {
        console.error(error);
        botContent.textContent = "Maaf, terjadi kesalahan: " + error.message;
    } finally {
        userInput.disabled = false;
        button.disabled = false;
        button.textContent = "Kirim";
        userInput.focus();
    }
});