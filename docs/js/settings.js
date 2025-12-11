import { performLogout } from './logout.js';

// ----------------------
// 动态加载页面组件
// ----------------------
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

// ----------------------
// 左侧菜单切换
// ----------------------
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

// ----------------------
// 页面交互统一管理
// ----------------------
document.addEventListener("click", async (e) => {

  // ---------- Address ----------
  const listEl = document.getElementById("saved-address-list");

  if (e.target.id === "save-address-btn") {
    const country = document.getElementById("country")?.value.trim();
    const state = document.getElementById("state")?.value.trim();
    const city = document.getElementById("city")?.value.trim();
    const street = document.getElementById("street")?.value.trim();
    const postal = document.getElementById("postal")?.value.trim();

    if (!country && !state && !city && !street) {
      alert("Please enter at least one address field!");
      return;
    }

    const newAddress = `${street}, ${city}, ${state}, ${country}${postal ? ', ' + postal : ''}`;

    if (listEl && listEl.querySelector(".empty-text")) listEl.innerHTML = "";

    const card = document.createElement("div");
    card.className = "address-card";
    card.innerHTML = `
      <div class="address-text">${newAddress}</div>
      <div class="address-actions">
        <button class="edit-btn">Edit</button>
        <button class="delete-btn">Delete</button>
      </div>
    `;
    listEl?.appendChild(card);

    ["country","state","city","street","postal"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });
  }

  if (e.target.classList.contains("delete-btn")) {
    const card = e.target.closest(".address-card");
    card?.remove();
    if (listEl && !listEl.querySelector(".address-card")) {
      listEl.innerHTML = `<p class="empty-text">No saved addresses yet.</p>`;
    }
  }

  if (e.target.classList.contains("edit-btn")) {
    const card = e.target.closest(".address-card");
    const textParts = card.querySelector(".address-text").innerText.split(",").map(s => s.trim());
    const [street, city, state, country, postal] = textParts;

    document.getElementById("street") && (document.getElementById("street").value = street || "");
    document.getElementById("city") && (document.getElementById("city").value = city || "");
    document.getElementById("state") && (document.getElementById("state").value = state || "");
    document.getElementById("country") && (document.getElementById("country").value = country || "");
    document.getElementById("postal") && (document.getElementById("postal").value = postal || "");

    card.remove();
  }

  // ---------- Subscription ----------
  if (e.target.closest(".subscription-card")) {
    const card = e.target.closest(".subscription-card");
    document.querySelectorAll(".subscription-card").forEach(c => c.classList.remove("selected"));
    card.classList.add("selected");
  }

  if (e.target.id === "subscribe-btn") {
    const selected = document.querySelector(".subscription-card.selected");
    if (!selected) return alert("Please select a plan!");
    const plan = selected.dataset.plan;
    alert(`Subscribed to the ${plan} plan!`);
  }

  // ---------- Privacy ----------
  const item = e.target.closest(".privacy-item");
  if (item) {
    const text = item.querySelector("span")?.innerText;

    switch (text) {
      case "Do Not Disturb":
        console.log("Do Not Disturb:", document.getElementById("dnd-toggle")?.checked);
        break;
      case "Message Notifications":
        console.log("Message Notifications:", document.getElementById("msg-toggle")?.checked);
        break;
      case "Minor Protection":
      case "Privacy Policy":
      case "Stratos Convention":
        alert(`Clicked on ${text}`);
        break;
      case "Blacklist":
        alert("Open Blacklist page/modal");
        break;
    }
  }

  // ---------- Logout ----------
  if (e.target.id === "logout-btn") {
    try {
      const channels = window.supabaseChannels || [];
      await performLogout(channels);
      window.location.href = 'index.html';
    } catch (err) {
      console.error("Logout failed:", err);
      alert("Logout failed. Please try again.");
    }
  }

  // ---------- Delete Account ----------
  if (e.target.id === "delete-account-btn") {
    alert("Delete Account functionality not implemented yet.");
  }

});
