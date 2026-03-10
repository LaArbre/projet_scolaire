const token = localStorage.getItem("token");

if (!token) {
    window.location.href = "../login/index.html";
}

const loadBtn = document.getElementById("load");
const logoutBtn = document.getElementById("logout");
const content = document.getElementById("content");

loadBtn.addEventListener("click", loadData);

async function loadData() {

    try {

        const response = await fetch("https://api.monsite.com/data", {
            headers: {
                "Authorization": "Bearer " + token
            }
        });

        const data = await response.json();

        content.innerHTML = "";

        data.forEach(item => {

            const div = document.createElement("div");
            div.textContent = JSON.stringify(item);

            content.appendChild(div);

        });

    } catch (error) {

        content.textContent = "Erreur chargement données";

    }

}

logoutBtn.addEventListener("click", () => {

    localStorage.removeItem("token");

    window.location.href = "../login/index.html";

});