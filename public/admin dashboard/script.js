const token = localStorage.getItem("token");

async function loadReports(){

const response = await fetch("/api/reports",{
headers:{
"Authorization":"Bearer "+token
}
});

const data = await response.json();

const container = document.getElementById("reports");

data.forEach(report => {

const div = document.createElement("div");

div.textContent =
report.code + " - " + report.status;

container.appendChild(div);

});

}

loadReports();