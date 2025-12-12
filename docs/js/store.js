let state = {
  openPanel: null,
  isMobile: false
};

const listeners = [];

export function getState(){ return state; }

export function setState(newState){
  state = {...state,...newState};
  listeners.forEach(fn=>fn(state));
}

export function subscribe(fn){
  listeners.push(fn);
}

// detect mobile
export function detectMobile(){
  return window.innerWidth <= 880;
}
