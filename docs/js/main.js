// 控制更多菜单的显示和隐藏
document.getElementById('more-button').addEventListener('click', () => {
  const moreMenu = document.getElementById('more-menu');
  moreMenu.style.display = moreMenu.style.display === 'block' ? 'none' : 'block';
});

// 点击菜单项时执行的动作（可以根据需要进行扩展）
document.getElementById('settings').addEventListener('click', () => {
  alert('Settings clicked');
});
document.getElementById('report-issue').addEventListener('click', () => {
  alert('Report Issue clicked');
});
document.getElementById('switch-account').addEventListener('click', () => {
  alert('Switch Account clicked');
});
document.getElementById('logout-btn').addEventListener('click', () => {
  alert('Logout clicked');
});
