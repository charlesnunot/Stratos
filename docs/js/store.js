// simple store: pub/sub
const state = {
  openPanel: null,
  isMobile: false
};

const listeners = new Set();

export function setState(patch){
  Object.assign(state, patch);
  listeners.forEach(fn => fn(state));
}

export function getState(){ return {...state}; }

export function subscribe(fn){ listeners.add(fn); return ()=>listeners.delete(fn); }

// detect mobile (used at load)
export function detectMobile(){ state.isMobile = window.innerWidth <= 880; return state.isMobile; }

