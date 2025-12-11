// js/settings.js
import { performLogout } from './logout.js';
import { getUser } from './userManager.js';
import { ProfileModal } from './profileModal.js'; 
import { getUserProfile, upsertUserProfile, getUserAddresses, addUserAddress, deleteUserAddress, updateUserAddress } from './userService.js';

// ======================
// 动态加载页面组件
// ======================
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

// ======================
// 获取当前用户
// ======================
const currentUser = getUser();
if (!currentUser || !currentUser.uid) {
  alert("User not logged in, redirecting to login...");
  window.location.href = "index.html";
} else {
  console.log("Current UID:", currentUser.uid);
}

// ======================
// 填充 Profile 数据
// ======================
async function fillProfileData() {
  const uid = currentUser.uid;
  const profile = await getUserProfile(uid);
  if (!profile) return console.warn("No profile data found for user:", uid);

  const fields = ['nickname','gender','birthday','region','occupation','school','bio','role'];
  fields.forEach(f => {
    const el = document.getElementById(`profile-${f}`);
    if (el && profile[f] !== undefined && profile[f] !== null) {
      el.innerText = profile[f];
    }
  });
}

// ======================
// 初始化 Profile 页面（加载 HTML + 填充数据）
// ======================
async function initProfileSection() {
  await loadSection("profile");
  await new Promise(resolve => requestAnimationFrame(resolve));
  await fillProfileData();
}

// 页面加载时默认显示 Profile
initProfileSection();

// ======================
// 初始化 Address 页面（加载 HTML + 填充数据）
// ======================
async function initAddressSection() {
  await loadSection("address");
  await new Promise(resolve => requestAnimationFrame(resolve));

  const uid = currentUser.uid;
  const addresses = await getUserAddresses(uid);

  const listEl = document.getElementById("saved-address-list");
  if (!listEl) return;
  listEl.innerHTML = "";

  if (addresses.length === 0) {
    listEl.innerHTML = `<p class="empty-text">No saved addresses yet.</p>`;
  } else {
    addresses.forEach(addr => {
      const card = document.createElement("div");
      card.className = "address-card";
      card.dataset.id = addr.id;
      card.innerHTML = `
        <div class="address-text">${addr.address}</div>
        <div class="address-actions">
          <button class="edit-btn">Edit</button>
          <button class="delete-btn">Delete</button>
        </div>
      `;
      listEl.appendChild(card);
    });
  }
}

// ======================
// 左侧菜单切换
// ======================
document.querySelectorAll(".menu-item").forEach(item => {
  item.addEventListener("click", async () => {
    const sec = item.dataset.section;

    if (sec === "profile") {
      await initProfileSection();
    } else if (sec === "address") {
      await initAddressSection();
    } else if (sec === "subscription") {
      await loadSection("subscription");
    } else if (sec === "privacy") {
      await loadSection("privacy");
    } else if (sec === "logout") {
      try {
        const channels = window.supabaseChannels || [];
        await performLogout(channels);
        window.location.href = 'index.html';
      } catch (err) {
        console.error("Logout failed:", err);
        alert("Logout failed. Please try again.");
      }
    } else if (sec === "delete-account") {
      await loadSection("delete-account");
    }
  });
});

// ======================
// 页面交互统一管理
// ======================
document.addEventListener("click", async (e) => {
  // ---------- Profile 编辑弹窗 ----------
  const cardItem = e.target.closest(".card-item");
  if (cardItem) {
    const valueEl = cardItem.querySelector(".value");
    if (valueEl) {
      const label = cardItem.querySelector(".label").innerText;
      const fieldId = valueEl.id;

      let type = "text";
      let options = [];

      if (fieldId === "profile-gender") type = "select", options = ["Male", "Female", "Other"];
      else if (fieldId === "profile-birthday") type = "date";
      else if (fieldId === "profile-bio") type = "textarea";

      ProfileModal.open(fieldId, label, valueEl.innerText, type, options);
    }
  }

  // ---------- Address 页面交互 ----------
  const listEl = document.getElementById("saved-address-list");

  // 新增 / 保存地址
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

    let editingCard = document.querySelector(".address-card.editing");
    if (editingCard) {
      // 编辑模式
      const id = parseInt(editingCard.dataset.id, 10);
      const success = await updateUserAddress(id, newAddress);
      if (!success) return alert("Failed to update address");

      editingCard.querySelector(".address-text").innerText = newAddress;
      editingCard.classList.remove("editing");
    } else {
      // 新增模式
      const saved = await addUserAddress(currentUser.uid, newAddress);
      if (!saved) return alert("Failed to save address");

      if (listEl && listEl.querySelector(".empty-text")) listEl.innerHTML = "";

      const card = document.createElement("div");
      card.className = "address-card";
      card.dataset.id = saved.id;
      card.innerHTML = `
        <div class="address-text">${saved.address}</div>
        <div class="address-actions">
          <button class="edit-btn">Edit</button>
          <button class="delete-btn">Delete</button>
        </div>
      `;
      listEl?.appendChild(card);
    }

    ["country","state","city","street","postal"].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });
  }

  // 删除地址
  if (e.target.classList.contains("delete-btn")) {
    const card = e.target.closest(".address-card");
    const id = parseInt(card.dataset.id, 10);
    if (id) {
      const success = await deleteUserAddress(id);
      if (!success) return alert("Failed to delete address");
    }
    card?.remove();
    if (listEl && !listEl.querySelector(".address-card")) {
      listEl.innerHTML = `<p class="empty-text">No saved addresses yet.</p>`;
    }
  }

  // 编辑地址
  if (e.target.classList.contains("edit-btn")) {
    const card = e.target.closest(".address-card");
    const textParts = card.querySelector(".address-text").innerText.split(",").map(s => s.trim());
    const [street, city, state, country, postal] = textParts;

    document.getElementById("street") && (document.getElementById("street").value = street || "");
    document.getElementById("city") && (document.getElementById("city").value = city || "");
    document.getElementById("state") && (document.getElementById("state").value = state || "");
    document.getElementById("country") && (document.getElementById("country").value = country || "");
    document.getElementById("postal") && (document.getElementById("postal").value = postal || "");

    card.classList.add("editing"); // 标记为编辑状态
  }

  // ---------- Subscription 页面交互 ----------
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

  // ---------- Privacy 页面交互 ----------
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

  // ---------- Logout 页面交互 ----------
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
