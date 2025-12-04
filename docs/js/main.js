// 显示和隐藏侧边栏的更多菜单
document.getElementById('more-button').addEventListener('click', () => {
  const sidebar = document.getElementById('sidebar');
  sidebar.classList.toggle('show-more');
});

