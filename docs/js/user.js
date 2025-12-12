// js/user.js
async function loadSidebar() {
  const container = document.getElementById("sidebar-container");
  if (!container) return;

  try {
    const resp = await fetch("components/sidebar.html");
    const html = await resp.text();
    container.innerHTML = html;
  } catch (err) {
    console.error("加载 sidebar 失败:", err);
  }
}

loadSidebar();

