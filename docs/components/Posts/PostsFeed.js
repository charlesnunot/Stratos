// docs/components/Posts/PostsFeed.js
export function mountPostsFeed(container, posts) {
  container.innerHTML = ''; // 清空内容

  posts.forEach(post => {
    const div = document.createElement('div');
    div.className = 'post';
    div.textContent = post;
    container.appendChild(div);
  });
}

