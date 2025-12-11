// js/profileModal.js

// 创建 Profile 编辑弹窗组件
export const ProfileModal = (() => {
  // 创建 DOM
  const modal = document.createElement("div");
  modal.id = "profile-edit-modal";
  modal.className = "modal";
  modal.style.display = "none";
  modal.innerHTML = `
    <div class="modal-content">
      <span class="close-btn">&times;</span>
      <h3 id="modal-title">Edit</h3>
      <input type="text" id="modal-input" placeholder="Enter value..." />
      <button id="modal-save-btn">Save</button>
    </div>
  `;

  // 添加到 body
  document.body.appendChild(modal);

  // DOM 元素
  const modalTitle = modal.querySelector("#modal-title");
  const modalInput = modal.querySelector("#modal-input");
  const modalSaveBtn = modal.querySelector("#modal-save-btn");
  const modalCloseBtn = modal.querySelector(".close-btn");

  let currentFieldId = "";

  // 打开弹窗
  const open = (fieldId, label, currentValue) => {
    currentFieldId = fieldId;
    modalTitle.innerText = `Edit ${label}`;
    modalInput.value = currentValue === "Loading..." ? "" : currentValue;
    modal.style.display = "flex";
    modalInput.focus();
  };

  // 关闭弹窗
  const close = () => {
    modal.style.display = "none";
  };

  // 保存事件
  modalSaveBtn.addEventListener("click", () => {
    const newValue = modalInput.value.trim();
    if (!newValue) return alert("Value cannot be empty!");
    const valueEl = document.getElementById(currentFieldId);
    if (valueEl) valueEl.innerText = newValue;
    close();
  });

  // 关闭按钮
  modalCloseBtn.addEventListener("click", close);

  // 点击遮罩关闭
  window.addEventListener("click", (e) => {
    if (e.target === modal) close();
  });

  return { open, close };
})();

