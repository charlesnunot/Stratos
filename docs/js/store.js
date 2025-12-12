import { setState, getState } from './store.js';

const ICONS = [
  { key:'home', label:'Home', icon:'fa-home', panel:null },
  { key:'search', label:'Search', icon:'fa-magnifying-glass', panel:'search' },
  { key:'explore', label:'Explore', icon:'fa-hashtag', panel:'explore' },
  { key:'market', label:'Market', icon:'fa-store', panel:'market' },
  { key:'create', label:'Create', icon:'fa-plus', panel:'create' },
  { key:'messages', label:'Messages', icon:'fa-envelope', panel:'messages' },
  { key:'chat', label:'Chat', icon:'fa-comment-dots', panel:'chat' },
  { key:'profile', label:'Profile', icon:'fa-user', panel:'profile' },
];

export function renderSidebar(container){
  container.innerHTML = '';
  ICONS.forEach(it=>{
    const div = document.createElement('div');
    div.className = 'sidebar-item';
    div.dataset.panel = it.panel || '';
    div.innerHTML = `<i class="fa-solid ${it.icon}"></i>`;
    container.appendChild(div);

    div.addEventListener('click', ()=>{
      if(!it.panel){ console.log('nav', it.key); return; }
      const current = getState().openPanel;
      setState({ openPanel: current === it.panel ? null : it.panel });
    });
  });
}
