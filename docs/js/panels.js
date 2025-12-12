import { subscribe, getState, setState } from './store.js';

const PANELS = {
  search: { title:'Search', body: '<p>Search interface</p>' },
  explore: { title:'Explore', body: '<p>Explore content</p>' },
  market: { title:'Marketplace', body: '<p>Market listings</p>' },
  create: { title:'Create', body: '<p>Create new item</p>' },
  messages: { title:'Messages', body: '<p>Messages list</p>' },
  chat: { title:'Chat', body: '<p>Chat channels</p>' },
  profile: { title:'Profile', body: '<p>User profile</p>' },
  notifications: { title:'Notifications', body: '<p>Notifications</p>' },
  settings: { title:'Settings', body: '<p>App settings</p>' }
};

let overlayEl = null;
let container = null;
const panelEls = {}; // cache created panels

export function initPanels(rootContainer){
  container = rootContainer; // root of main-area
  overlayEl = document.getElementById('overlay');
  overlayEl.addEventListener('click', ()=> setState({ openPanel:null }));
  // subscribe to store
  subscribe(handleState);
}

function ensurePanel(name){
  if(panelEls[name]) return panelEls[name];
  const node = document.createElement('div');
  node.className = 'panel';
  node.dataset.title = name;
  const cfg = PANELS[name] || {title:name, body:''};
  node.innerHTML = `<div class="panel-header"><strong>${cfg.title}</strong><div><button data-close class="topbar-btn" title="Close"><i class="fas fa-xmark"></i></button></div></div>
    <div class="panel-body">${cfg.body}</div>`;
  // close button
  node.querySelector('[data-close]').addEventListener('click', ()=> setState({ openPanel:null }));
  // append to #app so it's positioned absolute
  document.getElementById('app').appendChild(node);
  panelEls[name]=node;
  return node;
}

function handleState(s){
  const open = s.openPanel;
  // hide all
  Object.values(panelEls).forEach(p=> p.classList.remove('open'));
  // toggle overlay
  if(open){
    overlayEl.classList.add('visible');
    overlayEl.setAttribute('aria-hidden','false');
    // ensure panel exists and show
    const p = ensurePanel(open);
    p.classList.add('open');
  }else{
    overlayEl.classList.remove('visible');
    overlayEl.setAttribute('aria-hidden','true');
  }
  // also expose open to content resize if needed
}

