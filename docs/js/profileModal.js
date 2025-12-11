// js/profileModal.js

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

    // 清空旧输入
    modalInputContainer.innerHTML = "";

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

  // 保存事件
  modalSaveBtn.addEventListener("click", () => {
    if (!currentInputEl) return;
    const newValue = currentInputEl.value.trim();
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
