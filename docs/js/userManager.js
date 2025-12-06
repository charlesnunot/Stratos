// js/userManager.js

let currentUser = null;

export function setUser(user) {
  currentUser = user;
  localStorage.setItem('currentUser', JSON.stringify(user));
}

export function getUser() {
  if (!currentUser) {
    const data = localStorage.getItem('currentUser');
    if (data) currentUser = JSON.parse(data);
  }
  return currentUser;
}

export function clearUser() {
  currentUser = null;
  localStorage.removeItem('currentUser');
}
