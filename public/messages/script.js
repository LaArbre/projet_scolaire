const sendBtn = document.getElementById("send");

sendBtn.onclick = async () => {

    const message = document.getElementById("messageInput").value;

    await fetch("/api/message", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            message
        })
    });

};