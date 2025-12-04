// 获取按钮和菜单元素
const moreButton = document.getElementById('more-button');
const sidebar = document.getElementById('sidebar');

// 监听 More 按钮的点击事件
moreButton.addEventListener('click', function() {
  // 打印调试信息，检查点击事件是否触发
  console.log('More button clicked');

  // 切换 "show-more" 类
  sidebar.classList.toggle('show-more');

  // 打印当前是否添加了 "show-more" 类
  console.log('Sidebar classes:', sidebar.classList);
});
