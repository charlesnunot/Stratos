export function initContent(container) {
  const posts = [
    { title: 'User A', content: 'Hello, this is a post.' },
    { title: 'User B', content: 'Another post content here.' },
    { title: 'User C', content: 'More content...' },
  ];

  container.innerHTML = posts.map(p => `
    <div class="post-card">
      <h3>${p.title}</h3>
      <p>${p.content}</p>
    </div>
  `).join('');
}

