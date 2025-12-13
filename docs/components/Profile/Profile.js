const baseURL = new URL('.', import.meta.url);

export async function mountProfile(container) {
  if (!container) return;

  // 加载 HTML
  const html = await fetch(new URL('Profile.html', baseURL)).then(res => res.text());
  container.innerHTML = html;

  // 加载 CSS
  loadCSS(new URL('Profile.css', baseURL));

  // 模拟获取用户数据
  const usernameEl = container.querySelector('#profile-username');
  const emailEl = container.querySelector('#profile-email');
  const bioEl = container.querySelector('#profile-bio');
  const editBtn = container.querySelector('#profile-edit-btn');

  const userData = await fetchUserData();

  usernameEl.textContent = userData.username;
  emailEl.textContent = userData.email;
  bioEl.textContent = userData.bio;

  editBtn.addEventListener('click', () => {
    alert('Edit Profile feature coming soon!');
  });
}

// 模拟异步获取用户数据
async function fetchUserData() {
  return new Promise(resolve => {
    setTimeout(() => {
      resolve({
        username: 'JohnDoe',
        email: 'johndoe@example.com',
        bio: 'This is a sample bio.'
      });
    }, 300);
  });
}

// 加载 CSS
function loadCSS(href) {
  const url = href.toString();
  if (document.querySelector(`link[href="${url}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = url;
  document.head.appendChild(link);
}

