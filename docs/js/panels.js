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

export function initPanels() {
  subscribe(handleState);
}

function ensurePanel(name) {
  if (panelEls[name]) return panelEls[name];
  const cfg = PANELS[name] || { title: name, body: '' };

  const node = document.createElement('div');
  node.className = 'panel';
  node.dataset.title = name;

  node.innerHTML = `
    <div class="panel-header">
      <strong>${cfg.title}</strong>
      <button data-close class="close-btn">&times;</button>
    </div>
    <div class="panel-body">${cfg.body}</div>
  `;

  // 点击叉号收回面板
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
    const p = ensurePanel(open);
    setTimeout(() => { p.style.transform = 'translateX(0)'; }, 10);
  }
}
