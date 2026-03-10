const token = localStorage.getItem("token");

if (!token) {
    window.location.href = "../login/";
}

const sendBtn = document.getElementById("send");
const message = document.getElementById("message");

sendBtn.onclick = async () => {

    const description = document.getElementById("description").value;
    const type = document.getElementById("type").value;

    try {

        const response = await fetch("/api/report", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": "Bearer " + token
            },
            body: JSON.stringify({
                description,
                type
            })
        });

        const data = await response.json();

        message.textContent = "Signalement envoyé. Code : " + data.code;

    } catch (error) {

        message.textContent = "Erreur envoi signalement";

    }

};