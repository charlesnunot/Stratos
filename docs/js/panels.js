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

export function initPanels(){
  overlayEl = document.getElementById('overlay');
  overlayEl.addEventListener('click', () => setState({ openPanel: null }));
  subscribe(handleState);
}

function ensurePanel(name){
  if(panelEls[name]) return panelEls[name];
  const cfg = PANELS[name] || {title:name, body:''};

  const node = document.createElement('div');
  node.className = 'panel';
  node.dataset.title = name;

  // 左侧滑出样式
  node.style.position = 'fixed';
  node.style.top = '0';
  node.style.left = '60px';  // sidebar 宽度
  node.style.width = '340px';
  node.style.height = '100%';
  node.style.background = '#fff';
  node.style.borderRight = '1px solid #e6edf3';
  node.style.boxShadow = '2px 0 12px rgba(0,0,0,0.1)';
  node.style.transform = 'translateX(-100%)';
  node.style.transition = 'transform 0.3s ease';
  node.style.zIndex = '50';
  node.style.overflowY = 'auto';

  node.innerHTML = `
    <div class="panel-header">
      <strong>${cfg.title}</strong>
      <button data-close class="close-btn">&times;</button>
    </div>
    <div class="panel-body">${cfg.body}</div>
  `;

  node.querySelector('[data-close]').addEventListener('click', ()=> setState({ openPanel: null }));

  document.getElementById('app').appendChild(node);
  panelEls[name] = node;
  return node;
}

function handleState(state){
  const open = state.openPanel;

  // 隐藏所有面板
  Object.values(panelEls).forEach(p => p.style.transform = 'translateX(-100%)');

  if(open){
    overlayEl.classList.add('visible');
    overlayEl.setAttribute('aria-hidden','false');
    const p = ensurePanel(open);
    setTimeout(()=> { p.style.transform = 'translateX(0)'; }, 10);
  } else {
    overlayEl.classList.remove('visible');
    overlayEl.setAttribute('aria-hidden','true');
  }
}
