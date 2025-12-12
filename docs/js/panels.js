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
  const app = document.getElementById('app');
  Object.keys(PANELS).forEach(key => {
    const cfg = PANELS[key];
    const node = document.createElement('div');
    node.className = 'panel';
    node.dataset.key = key;
    node.innerHTML = `
      <div class="panel-header"><strong>${cfg.title}</strong></div>
      <div class="panel-body">${cfg.body}</div>
    `;
    node.style.display = 'none'; // 默认隐藏
    app.appendChild(node);
    panelEls[key] = node;
  });

  subscribe(state => {
    Object.values(panelEls).forEach(p => p.style.display = 'none');
    if(state.openPanel && panelEls[state.openPanel]){
      panelEls[state.openPanel].style.display = 'block';
    }
  });
}
