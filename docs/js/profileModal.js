// js/profileModal.js
import { upsertUserProfile } from "./userService.js";
import { getUser, setUser } from "./userManager.js";

// 完全动态生成 Profile 编辑弹窗
export const ProfileModal = (() => {
  const modal = document.createElement("div");
  modal.id = "profile-edit-modal";
  modal.className = "modal";
  modal.style.display = "none";

  modal.innerHTML = `
    <div class="modal-content">
      <span class="close-btn">&times;</span>
      <h3 id="modal-title">Edit</h3>
      <div id="modal-input-container"></div>
      <button id="modal-save-btn">Save</button>
    </div>
  `;

  document.body.appendChild(modal);

  // DOM 元素
  const modalTitle = modal.querySelector("#modal-title");
  const modalInputContainer = modal.querySelector("#modal-input-container");
  const modalSaveBtn = modal.querySelector("#modal-save-btn");
  const modalCloseBtn = modal.querySelector(".close-btn");

  let currentFieldId = "";
  let currentInputEl = null;

  // 打开弹窗
  const open = (fieldId, label, currentValue, type = "text", options = []) => {
    currentFieldId = fieldId;
    modalTitle.innerText = `Edit ${label}`;
    modalInputContainer.innerHTML = "";

    // 创建输入组件
    if (type === "text" || type === "date") {
      const input = document.createElement("input");
      input.type = type;
      input.value = currentValue === "Loading..." ? "" : currentValue;
      modalInputContainer.appendChild(input);
      currentInputEl = input;
    } else if (type === "textarea") {
      const textarea = document.createElement("textarea");
      textarea.rows = 4;
      textarea.value = currentValue === "Loading..." ? "" : currentValue;
      modalInputContainer.appendChild(textarea);
      currentInputEl = textarea;
    } else if (type === "select") {
      const select = document.createElement("select");
      options.forEach(opt => {
        const optionEl = document.createElement("option");
        optionEl.value = opt;
        optionEl.innerText = opt;
        if (opt === currentValue) optionEl.selected = true;
        select.appendChild(optionEl);
      });
      modalInputContainer.appendChild(select);
      currentInputEl = select;
    }

    modal.style.display = "flex";
    currentInputEl.focus();
  };

  // 关闭弹窗
  const close = () => {
    modal.style.display = "none";
  };

  // 保存事件（写入 UI + 写入数据库）
  modalSaveBtn.addEventListener("click", async () => {
    if (!currentInputEl) return;

    const newValue = currentInputEl.value.trim();
    if (!newValue) return alert("Value cannot be empty!");

    // 1️⃣ 更新 UI
    const valueEl = document.getElementById(currentFieldId);
    if (valueEl) valueEl.innerText = newValue;

    // 2️⃣ 获取 uid
    const user = getUser();
    if (!user || !user.uid) {
      alert("User not logged in.");
      close();
      return;
    }

    // 3️⃣ 解析字段名
    // 例如 profile-nickname → nickname
    const dbField = currentFieldId.replace("profile-", "");

    const profileUpdate = {
      uid: user.uid,
      [dbField]: newValue
    };

    // 4️⃣ 更新数据库
    const saved = await upsertUserProfile(profileUpdate);
    if (!saved) {
      alert("Failed to save data to server.");
    } else {
      const updatedUser = { ...user, [dbField]: newValue };
      setUser(updatedUser);
    }

    close();
  });

  // 点击关闭按钮
  modalCloseBtn.addEventListener("click", close);

  // 点击遮罩关闭
  window.addEventListener("click", (e) => {
    if (e.target === modal) close();
  });

  return { open, close };
})();
