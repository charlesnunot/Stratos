// docs/app/AppRoot.js
import { state, actions, subscribe } from '../store/index.js';
import { mountAuthApp } from './AuthApp.js';
import { mountMainApp } from './MainApp.js';

export async function mountApp(root) {
  if (!root) return;

  // 1️⃣ 启动即判断登录状态
  await checkAuth();

  // 2️⃣ 首次渲染
  render(root);

  // 3️⃣ 监听 auth 状态变化
  subscribe((state, key) => {
    if (key === 'auth.status') {
      render(root);
    }
  });
}

function render(root) {
  root.innerHTML = '';

  switch (state.auth.status) {
    case 'checking':
      root.innerHTML = `<div class="app-loading">Loading...</div>`;
      break;

    case 'guest':
      mountAuthApp(root);
      break;

    case 'authenticated':
      mountMainApp(root);
      break;
  }
}
