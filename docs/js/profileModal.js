// js/profileModal.js

export const ProfileModal = (() => {
  // 获取已经存在的 DOM
  const modal = document.getElementById("profile-edit-modal");
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
