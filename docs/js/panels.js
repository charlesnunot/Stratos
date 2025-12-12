import { getState, setState, subscribe } from './store.js';

const PANELS = {
  search: { title:'Search', body:'<p>Search interface</p>' },
  explore: { title:'Explore', body:'<p>Explore content</p>' },
  market: { title:'Market', body:'<p>Marketplace</p>' },
  create: { title:'Create', body:'<p>Create content</p>' },
  messages: { title:'Messages', body:'<p>Messages list</p>' },
  chat: { title:'Chat', body:'<p>Chat channels</p>' },
  profile: { title:'Profile', body:'<p>User profile</p>' },
  notifications: { title:'Notifications', body:'<p>Notifications</p>' },
  settings: { title:'Settings', body:'<p>App settings</p>' }
};

let container = null;
const panelEls = {};
let overlayEl = null;

export function initPanels(rootContainer){
  container = rootContainer;
  overlayEl = document.getElementById('overlay');

  overlayEl.addEventListener('click', () => setState({ openPanel: null }));
  subscribe(handleState);
}

function ensurePanel(name){
  if(panelEls[name]) return panelEls[name];

  const cfg = PANELS[name];
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
  
  node.querySelector('[data-close]').addEventListener('click', () => {
    // **仅更新状态，不修改 sidebar DOM**
    setState({ openPanel: null });
  });

  document.body.appendChild(node);
  panelEls[name] = node;
  return node;
}

function handleState(state){
  const open = state.openPanel;

  Object.values(panelEls).forEach(p => p.classList.remove('open'));
  if(open){
    overlayEl.classList.add('visible');
    overlayEl.setAttribute('aria-hidden','false');

    const panel = ensurePanel(open);
    panel.classList.add('open');
  } else {
    overlayEl.classList.remove('visible');
    overlayEl.setAttribute('aria-hidden','true');
  }
}
