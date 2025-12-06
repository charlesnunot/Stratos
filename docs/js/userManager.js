// js/userManager.js

let userData = null;

export function initUser() {
  const saved = localStorage.getItem('userData');
  if (saved) userData = JSON.parse(saved);
  else userData = null;
}

export function setUser(data) {
  userData = data;
  localStorage.setItem('userData', JSON.stringify(data));
}

export function getUser() {
  return userData;
}

export function updateUser(updates) {
  if (!userData) return;
  userData = { ...userData, ...updates };
  localStorage.setItem('userData', JSON.stringify(userData));
}

export function clearUser() {
  userData = null;
  localStorage.removeItem('userData');
}
