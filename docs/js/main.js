// main.js

// 获取按钮和菜单元素
const moreButton = document.getElementById('more-button');
const sidebar = document.getElementById('sidebar');

// 监听 More 按钮的点击事件
moreButton.addEventListener('click', function() {
  // 切换 "show-more" 类
  sidebar.classList.toggle('show-more');
});

