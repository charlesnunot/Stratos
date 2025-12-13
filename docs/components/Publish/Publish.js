const baseURL = new URL('.', import.meta.url);

export async function mountPublish(container) {
  if (!container) return;

  // 加载 HTML
  const html = await fetch(new URL('Publish.html', baseURL)).then(res => res.text());
  container.innerHTML = html;

  // 加载 CSS
  loadCSS(new URL('Publish.css', baseURL));

  // 获取 DOM
  const textarea = container.querySelector('#publish-content');
  const submitBtn = container.querySelector('#publish-submit');
  const feedback = container.querySelector('#publish-feedback');

  // 绑定发布事件
  submitBtn.addEventListener('click', () => {
    const content = textarea.value.trim();
    if (!content) {
      feedback.textContent = 'Content cannot be empty.';
      feedback.style.color = 'red';
      return;
    }

    // 模拟提交
    feedback.textContent = 'Post published!';
    feedback.style.color = 'green';
    textarea.value = '';
  });
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

