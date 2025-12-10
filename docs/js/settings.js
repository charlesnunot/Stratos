// js/settings.js

// 切换右侧内容显示（已有逻辑）
const menuItems = document.querySelectorAll('#settings-menu .menu-item[data-section]');
const sections = document.querySelectorAll('.settings-section');

menuItems.forEach(item => {
  item.addEventListener('click', () => {
    const sectionId = item.dataset.section;
    sections.forEach(sec => {
      sec.style.display = sec.id === sectionId ? 'block' : 'none';
    });
  });
});



