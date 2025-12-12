import { subscribe, getState } from './store.js';

export function renderContent(container){
  // sample feed
  const html = new Array(8).fill(0).map((_,i)=>`
    <article class="card">
      <h4>Post #${i+1}</h4>
      <p>Example content for post ${i+1} — this is a demo card to show scroll and layout behavior.</p>
    </article>
  `).join('');
  container.innerHTML = html;

  // adjust content container flex when panel opens/closes
  subscribe(state => {
    const open = state.openPanel;
    // if a panel is open, shrink content by panel width (挤压模式). Mobile overlay behaviour not compressed.
    const isMobile = state.isMobile;
    if(open && !isMobile){
      container.style.paddingRight = '20px';
      // because panels are absolute and push content visually, we only need to shrink viewport by CSS calc
      container.parentElement.style.setProperty('transform','translateX(0)'); // safe noop
      // set right margin to reserve space for panel
      container.style.marginRight = `calc(var(--panel-w))`;
    } else {
      container.style.marginRight = '';
    }
  });
}

