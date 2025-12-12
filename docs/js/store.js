let state = {
  openPanel: null,
  isMobile: false,
};

const subscribers = [];

export function setState(newState) {
  state = { ...state, ...newState };
  subscribers.forEach(fn => fn(state));
}

export function getState() {
  return state;
}

export function subscribe(fn) {
  subscribers.push(fn);
}
