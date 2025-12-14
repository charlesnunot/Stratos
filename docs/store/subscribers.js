// docs/store/subscribers.js
const listeners = new Set();

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn); // 取消订阅
}

export function notify(state, changedKey) {
  listeners.forEach(fn => fn(state, changedKey));
}

