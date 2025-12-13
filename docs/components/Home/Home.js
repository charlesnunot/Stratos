const baseURL = new URL('.', import.meta.url);

export async function mountHome(container) {
  if (!container) return;

  // 加载 HTML
  const html = await fetch(new URL('Home.html', baseURL)).then(res => res.text());
  container.innerHTML = html;

  // 可选加载 CSS
  loadCSS(new URL('Home.css', baseURL));

  // 挂载默认标签内容（Discover）
  loadTabContent('discover');

  // 绑定标题栏点击事件
  const tabs = container.querySelectorAll('.home-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      // 更新激活状态
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      // 加载对应内容
      const tabName = tab.dataset.tab;
      loadTabContent(tabName);
    });
  });
}

// 根据标签名加载内容
async function loadTabContent(tabName) {
  const contentContainer = document.getElementById('home-content');
  if (!contentContainer) return;

  contentContainer.innerHTML = ''; // 清空内容

  switch (tabName) {
    case 'discover': {
      const { mountDiscover } = await import(new URL('../Posts/Discover.js', baseURL));
      mountDiscover(contentContainer);
      break;
    }
    case 'following': {
      const { mountFollowing } = await import(new URL('../Posts/Following.js', baseURL));
      mountFollowing(contentContainer);
      break;
    }
    case 'search': {
      const { mountSearch } = await import(new URL('../Posts/Search.js', baseURL));
      mountSearch(contentContainer);
      break;
    }
    default:
      console.warn('未知标签:', tabName);
  }
}

// CSS 加载函数
function loadCSS(href) {
  const url = href.toString();
  if (document.querySelector(`link[href="${url}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = url;
  document.head.appendChild(link);
}
