// js/settings.js

// 动态加载页面组件
async function loadSection(fileName) {
  try {
    const res = await fetch(`components/${fileName}.html`);
    if (!res.ok) throw new Error(`Failed to load ${fileName}.html`);
    const html = await res.text();
    document.getElementById("settings-content").innerHTML = html;
  } catch (err) {
    console.error(err);
    document.getElementById("settings-content").innerHTML = `<p style="color:red;">Failed to load section: ${fileName}</p>`;
  }
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

// Address 页面交互逻辑：新增 / 编辑 / 删除地址
document.addEventListener("click", (e) => {
  const listEl = document.getElementById("saved-address-list");

  // 保存新地址
  if (e.target.id === "save-address-btn") {
    const country = document.getElementById("country").value.trim();
    const state = document.getElementById("state").value.trim();
    const city = document.getElementById("city").value.trim();
    const street = document.getElementById("street").value.trim();
    const postal = document.getElementById("postal").value.trim();

    if (!country && !state && !city && !street) {
      alert("Please enter at least one address field!");
      return;
    }

    const newAddress = `${street}, ${city}, ${state}, ${country}${postal ? ', ' + postal : ''}`;

    // 移除空提示
    if (listEl && listEl.querySelector(".empty-text")) {
      listEl.innerHTML = "";
    }

    // 创建地址卡片
    const card = document.createElement("div");
    card.className = "address-card";
    card.innerHTML = `
      <div class="address-text">${newAddress}</div>
      <div class="address-actions">
        <button class="edit-btn">Edit</button>
        <button class="delete-btn">Delete</button>
      </div>
    `;

    listEl.appendChild(card);

    // 清空表单
    ["country","state","city","street","postal"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });
  }

  // 删除地址
  if (e.target.classList.contains("delete-btn")) {
    const card = e.target.closest(".address-card");
    card?.remove();
    if (listEl && !listEl.querySelector(".address-card")) {
      listEl.innerHTML = `<p class="empty-text">No saved addresses yet.</p>`;
    }
  }

  // 编辑地址
  if (e.target.classList.contains("edit-btn")) {
    const card = e.target.closest(".address-card");
    const textParts = card.querySelector(".address-text").innerText.split(",").map(s => s.trim());

    // 填充表单
    const [street, city, state, country, postal] = textParts;
    if (document.getElementById("street")) document.getElementById("street").value = street || "";
    if (document.getElementById("city")) document.getElementById("city").value = city || "";
    if (document.getElementById("state")) document.getElementById("state").value = state || "";
    if (document.getElementById("country")) document.getElementById("country").value = country || "";
    if (document.getElementById("postal")) document.getElementById("postal").value = postal || "";

    // 删除旧卡片
    card.remove();
  }
});
