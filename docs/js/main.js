import { renderSidebar } from './sidebar.js';
import { renderTopbar } from './topbar.js';
import { initPanels } from './panels.js';
import { renderContent } from './content.js';
import { detectMobile, setState, subscribe } from './store.js';

// DOM refs
const sidebar=document.getElementById('sidebar-container');
const topbar=document.getElementById('topbar-container');
const content=document.getElementById('content-container');
const app=document.getElementById('app');

renderSidebar(sidebar);
renderTopbar(topbar);
initPanels(app);
renderContent(content);

setState({ isMobile: detectMobile() });

// window resize
window.addEventListener('resize', ()=> setState({ isMobile: window.innerWidth <=880 }));

// mobile tabbar
subscribe(state=>{
  let tab=document.querySelector('.mobile-tabbar');
  if(state.isMobile){
    if(!tab){
      tab=document.createElement('div');
      tab.className='mobile-tabbar';
      tab.innerHTML=`
        <div class="sidebar-item"><i class="fas fa-home"></i></div>
        <div class="sidebar-item"><i class="fas fa-search"></i></div>
        <div class="sidebar-item"><i class="fas fa-plus"></i></div>
        <div class="sidebar-item"><i class="fas fa-comment-dots"></i></div>
        <div class="sidebar-item"><i class="fas fa-user"></i></div>
      `;
      document.body.appendChild(tab);
    }
  } else {
    if(tab) tab.remove();
  }
});
