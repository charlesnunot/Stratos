// js/settings.js

// 切换右侧内容显示
const menuItems = document.querySelectorAll('#settings-menu .menu-item');
const sections = document.querySelectorAll('.settings-section');

menuItems.forEach(item => {
  item.addEventListener('click', () => {
    const sectionId = item.dataset.section;
    sections.forEach(sec => {
      sec.style.display = sec.id === sectionId ? 'block' : 'none';
    });
  });
});

// 示例：绑定 Logout 按钮
const logoutBtn = document.getElementById('logout-btn');
logoutBtn?.addEventListener('click', () => {
  // 调用你的 performLogout 或跳转登录页
  alert('Logging out...');
});

// 示例：绑定 Delete Account
const deleteBtn = document.getElementById('delete-account-btn');
deleteBtn?.addEventListener('click', () => {
  if (confirm('Are you sure you want to delete your account?')) {
    alert('Account deleted');
    // 这里调用删除账户的逻辑
  }
});

