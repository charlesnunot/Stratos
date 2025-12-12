import { subscribe, getState } from './store.js';

export function renderContent(container){
  const html=new Array(8).fill(0).map((_,i)=>`
    <article class="card">
      <h4>Post #${i+1}</h4>
      <p>Example content for post ${i+1} — demo card to show scroll and layout behavior.</p>
    </article>
  `).join('');
  container.innerHTML=html;

  subscribe(state=>{
    const open=state.openPanel;
    const isMobile=state.isMobile;
    if(open && !isMobile){
      container.style.marginRight=`var(--panel-w)`;
    } else {
      container.style.marginRight='';
    }
  });
}
