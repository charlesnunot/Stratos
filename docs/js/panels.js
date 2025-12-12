function ensurePanel(name) {
  if (panelEls[name]) return panelEls[name];
  const cfg = PANELS[name] || { title: name, body: '' };

  const node = document.createElement('div');
  node.className = 'panel';
  node.dataset.title = name;

  // 左侧滑出样式，去掉阴影
  Object.assign(node.style, {
    position: 'fixed',
    top: '0',
    left: '60px',        // sidebar 宽度
    width: '340px',
    height: '100%',
    background: '#fff',
    borderRight: '1px solid #e6edf3',
    boxShadow: 'none',           // <-- 去掉阴影
    transform: 'translateX(-100%)',
    transition: 'transform 0.3s ease',
    zIndex: '50',
    overflowY: 'auto',
  });

  node.innerHTML = `
    <div class="panel-header">
      <strong>${cfg.title}</strong>
      <button data-close class="close-btn">&times;</button>
    </div>
    <div class="panel-body">${cfg.body}</div>
  `;

  node.querySelector('[data-close]').addEventListener('click', () => {
    setState({ openPanel: null });
  });

  document.getElementById('app').appendChild(node);
  panelEls[name] = node;
  return node;
}
