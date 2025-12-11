// js/profileModal.js

export const ProfileModal = (() => {
  const modal = document.getElementById("profile-edit-modal");
  const modalTitle = modal.querySelector("#modal-title");
  const modalContent = modal.querySelector(".modal-content");
  const modalSaveBtn = modal.querySelector("#modal-save-btn");
  const modalCloseBtn = modal.querySelector(".close-btn");

  let currentFieldId = "";
  let currentType = "text";

  // 打开弹窗
  const open = ({ fieldId, label, type = "text", options = [], currentValue = "" }) => {
    currentFieldId = fieldId;
    currentType = type;

    modalTitle.innerText = `Edit ${label}`;

    // 移除旧输入控件
    const oldInput = modalContent.querySelector(".modal-input-wrapper");
    if (oldInput) oldInput.remove();

    // 创建输入控件
    const wrapper = document.createElement("div");
    wrapper.className = "modal-input-wrapper";

    let inputEl;

    switch (type) {
      case "textarea":
        inputEl = document.createElement("textarea");
        inputEl.rows = 4;
        inputEl.value = currentValue === "Loading..." ? "" : currentValue;
        break;
      case "select":
        inputEl = document.createElement("select");
        options.forEach(opt => {
          const optionEl = document.createElement("option");
          optionEl.value = opt;
          optionEl.text = opt;
          if (opt === currentValue) optionEl.selected = true;
          inputEl.appendChild(optionEl);
        });
        break;
      case "date":
        inputEl = document.createElement("input");
        inputEl.type = "date";
        inputEl.value = currentValue ? currentValue : "";
        break;
      case "text":
      default:
        inputEl = document.createElement("input");
        inputEl.type = "text";
        inputEl.value = currentValue === "Loading..." ? "" : currentValue;
    }

    inputEl.id = "modal-input";
    inputEl.className = "modal-input";
    wrapper.appendChild(inputEl);

    // 插入到 modalContent，Save 按钮前
    modalContent.insertBefore(wrapper, modalSaveBtn);

    modal.style.display = "flex";
    inputEl.focus();
  };

  const close = () => {
    modal.style.display = "none";
  };

  modalSaveBtn.addEventListener("click", () => {
    const inputEl = modalContent.querySelector(".modal-input");
    let newValue = inputEl.value.trim();
    if (!newValue) return alert("Value cannot be empty!");

    // 对 select 和 date 直接取 value
    if (currentType === "select" || currentType === "date") {
      newValue = inputEl.value;
    }

    const valueEl = document.getElementById(currentFieldId);
    if (valueEl) valueEl.innerText = newValue;
    close();
  });

  modalCloseBtn.addEventListener("click", close);
  window.addEventListener("click", e => { if (e.target === modal) close(); });

  return { open, close };
})();
