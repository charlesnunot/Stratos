import { subscribe } from './store.js';

export function renderContent(container){
  const html = new Array(8).fill(0).map((_,i)=>`
    <article class="card">
      <h4>Post #${i+1}</h4>
      <p>Example content for post ${i+1}</p>
    </article>
  `).join('');
  container.innerHTML = html;

  subscribe(state=>{
    if(state.openPanel){
      container.style.marginRight = '340px';
    } else {
      container.style.marginRight = '';
    }
  });
}
