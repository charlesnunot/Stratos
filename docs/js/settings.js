// js/settings.js

async function loadSection(fileName) {
  const res = await fetch(`components/${fileName}.html`);
  const html = await res.text();
  document.getElementById("settings-content").innerHTML = html;
}

// 默认加载 Profile
loadSection("profile");

// 左侧菜单切换
document.querySelectorAll(".menu-item").forEach(item => {
  item.addEventListener("click", () => {
    const sec = item.dataset.section;

    if (sec === "profile") loadSection("profile");
    else if (sec === "address") loadSection("address");
    else if (sec === "subscription") loadSection("subscription");
    else if (sec === "privacy") loadSection("privacy");
    else if (sec === "logout") loadSection("logout");
    else if (sec === "delete-account") loadSection("delete-account");
  });
});

document.addEventListener("click", (e) => {
  if (e.target.id === "save-address-btn") {
    const country = document.getElementById("country").value;
    const state = document.getElementById("state").value;
    const city = document.getElementById("city").value;
    const street = document.getElementById("street").value;
    const postal = document.getElementById("postal").value;

    const newAddress = `${street}, ${city}, ${state}, ${country}${postal ? ', ' + postal : ''}`;

    const listEl = document.getElementById("saved-address-list");
    if (listEl.querySelector("p") && listEl.querySelector("p").innerText === "No saved addresses yet.") {
      listEl.innerHTML = "";
    }

    const itemEl = document.createElement("p");
    itemEl.innerText = newAddress;
    listEl.appendChild(itemEl);

    // 清空表单
    document.getElementById("country").value = "";
    document.getElementById("state").value = "";
    document.getElementById("city").value = "";
    document.getElementById("street").value = "";
    document.getElementById("postal").value = "";
  }
});


