import { getState, setState, subscribe } from './store.js';

const PANELS = {
  search: { title: 'Search', body: '<p>Search interface</p>' },
  explore: { title: 'Explore', body: '<p>Explore content</p>' },
  market: { title: 'Market', body: '<p>Marketplace</p>' },
  create: { title: 'Create', body: '<p>Create content</p>' },
  messages: { title: 'Messages', body: '<p>Messages list</p>' },
  chat: { title: 'Chat', body: '<p>Chat channels</p>' },
  profile: { title: 'Profile', body: '<p>User profile</p>' },
  notifications: { title: 'Notifications', body: '<p>Notifications</p>' },
  settings: { title: 'Settings', body: '<p>App settings</p>' }
};

const panelEls = {};
let overlayEl = null;

export function initPanels() {
  overlayEl = document.getElementById('overlay');
  overlayEl.addEventListener('click', () => setState({ openPanel: null }));
  subscribe(handleState);
}

function ensurePanel(name) {
  if (panelEls[name]) return panelEls[name];
  const cfg = PANELS[name] || { title: name, body: '' };

  const node = document.createElement('div');
  node.className = 'panel';
  node.dataset.title = name;

  // 左侧滑出，去掉阴影
  Object.assign(node.style, {
    position: 'fixed',
    top: '0',
    left: '60px',        // sidebar 宽度
    width: '340px',
    height: '100%',
    background: '#fff',
    borderRight: '1px solid #e6edf3',
    boxShadow: 'none',   // 去掉阴影
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

function handleState(state) {
  const open = state.openPanel;

  // 隐藏所有面板
  Object.values(panelEls).forEach(p => p.style.transform = 'translateX(-100%)');

  if (open) {
    overlayEl.classList.add('visible');
    overlayEl.setAttribute('aria-hidden', 'false');

    const p = ensurePanel(open);
    setTimeout(() => { p.style.transform = 'translateX(0)'; }, 10);
  } else {
    overlayEl.classList.remove('visible');
    overlayEl.setAttribute('aria-hidden', 'true');
  }

  // 保证 sidebar 永远可见在面板之上
  const sidebar = document.getElementById('sidebar-container');
  sidebar.style.display = 'flex';
  sidebar.style.zIndex = '60';
}
