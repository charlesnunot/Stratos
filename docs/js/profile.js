import { ProfileModal } from './profileModal.js';

ProfileModal.init(); // 初始化弹窗

// 绑定列表项点击事件
document.addEventListener('click', (e) => {
  const fieldCard = e.target.closest('.card-item');
  if (!fieldCard) return;
  const labelEl = fieldCard.querySelector('.label');
  const valueEl = fieldCard.querySelector('.value');
  if (labelEl && valueEl) {
    ProfileModal.open(valueEl.id, labelEl.innerText, valueEl.innerText);
  }
});

