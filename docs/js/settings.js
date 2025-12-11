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

