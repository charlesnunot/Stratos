// docs/components/More/More.js
import { signOut } from '../../store/supabase.js'
import { clearUser, setUser } from '../../store/userManager.js'
import { publish } from '../../store/subscribers.js'

const baseURL = new URL('.', import.meta.url);

let menuEl = null;

export async function mountMore(container, triggerEl) {
  if (!container || !triggerEl) return;

  // 如果已经存在，直接切换显示
  if (menuEl) {
    menuEl.classList.toggle('show');
    return;
  }

  // 加载 HTML
  const html = await fetch(new URL('More.html', baseURL)).then(res => res.text());

  // 用 wrapper 解析 HTML（⚠️ 不覆盖 container）
  const wrapper = document.createElement('div');
  wrapper.innerHTML = html;
  menuEl = wrapper.firstElementChild;

  // 加载 CSS
  loadCSS(new URL('More.css', baseURL));

  // 插入到 body
  container.appendChild(menuEl);

  const settings = menuEl.querySelector('#more-settings');
  const report = menuEl.querySelector('#more-report');
  const logout = menuEl.querySelector('#more-logout');

  // More 按钮点击
  triggerEl.addEventListener('click', e => {
    e.stopPropagation();
    menuEl.classList.toggle('show');
  });

  // 点击菜单项
  settings.addEventListener('click', () => {
    alert('Open Settings');
    hide();
  });

  report.addEventListener('click', () => {
    alert('Open Report');
    hide();
  });

  // 退出登录
  logout.addEventListener('click', async () => {
    hide();
    try {
      await signOut();      // Supabase 登出
      clearUser();          // 清空前端用户状态
      publish('userChange', null); // 发布全局事件
      alert('Logged out successfully');
    } catch (err) {
      console.error('Logout failed', err);
      alert('Logout failed');
    }
  });

  // 点击空白关闭
  document.addEventListener('click', e => {
    if (!menuEl.contains(e.target) && e.target !== triggerEl) {
      hide();
    }
  });
}

function hide() {
  if (menuEl) menuEl.classList.remove('show');
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
