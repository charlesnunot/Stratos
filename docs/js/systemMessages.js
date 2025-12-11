export async function loadSystemMessages(mountId, uid) {
  const mountEl = document.getElementById(mountId);
  if (!mountEl) return;

  // 1️⃣ 加载 HTML
  const res = await fetch('components/system-messages.html');
  if (!res.ok) return console.error('Failed to load system messages HTML');
  const html = await res.text();
  mountEl.innerHTML = html;

  // 2️⃣ 初始化消息逻辑（订阅、渲染等）
  initSystemMessages(uid);
}

function initSystemMessages(uid) {
  // TODO: 订阅系统消息、渲染消息列表、标记已读逻辑
  console.log('初始化系统消息 for uid:', uid);
}

