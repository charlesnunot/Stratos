export function initUserPanel(container) {
  const users = [
    { name: 'Alice', avatar: 'https://via.placeholder.com/40' },
    { name: 'Bob', avatar: 'https://via.placeholder.com/40' },
    { name: 'Charlie', avatar: 'https://via.placeholder.com/40' },
  ];

  container.innerHTML = users.map(u => `
    <div class="user-card">
      <img src="${u.avatar}" alt="${u.name}">
      <div class="username">${u.name}</div>
    </div>
  `).join('');
}

