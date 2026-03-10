const searchBtn = document.getElementById("search");

searchBtn.onclick = async () => {

    const code = document.getElementById("code").value;

    const response = await fetch("/api/report/" + code);

    const data = await response.json();

    document.getElementById("result").textContent =
        "Statut : " + data.status;

};