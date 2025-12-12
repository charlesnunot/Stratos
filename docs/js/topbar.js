import { setState, getState } from './store.js';

export function renderTopbar(container){
  container.innerHTML=`
    <div class="topbar-left"><div class="brand">Stratos</div></div>
    <div style="flex:1;display:flex;justify-content:center;align-items:center">
      <div class="search-box"><i class="fas fa-search"></i><input placeholder="Search"></div>
    </div>
    <div class="topbar-actions">
      <div class="topbar-btn" id="notif-btn" title="Notifications"><i class="fas fa-bell"></i></div>
      <div class="topbar-btn" id="settings-btn" title="Settings"><i class="fas fa-gear"></i></div>
    </div>
  `;

  container.querySelector('#notif-btn').addEventListener('click', ()=>{
    const current=getState().openPanel;
    setState({ openPanel: current==='notifications'?null:'notifications' });
  });
  container.querySelector('#settings-btn').addEventListener('click', ()=>{
    const current=getState().openPanel;
    setState({ openPanel: current==='settings'?null:'settings' });
  });
}
