window.onload = function() {
  const moreButton = document.getElementById('more-button');
  if (moreButton) {
    moreButton.addEventListener('click', function() {
      console.log('More button clicked');  // 确保事件绑定
      const sidebar = document.getElementById('sidebar');
      sidebar.classList.toggle('show-more');
      console.log('Sidebar classes:', sidebar.classList);  // 打印 class 状态
    });
  } else {
    console.log('More button not found');
  }
};
