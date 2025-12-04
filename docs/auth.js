// auth.js - 登录/注册模态逻辑
document.addEventListener('DOMContentLoaded', () => {
  const loggedInUser = localStorage.getItem('loggedInUser');
  if(loggedInUser){
    document.getElementById('username')?.textContent = loggedInUser;
    document.getElementById('user-info')?.style.display = 'flex';
  } else {
    showLoginModal();
  }
});

function showLoginModal(){
  const overlayHtml = `
  <div class="modal-overlay" id="login-overlay">
    <div class="modal" id="login-modal">
      <h2>Login</h2>
      <input type="email" id="email" placeholder="Email">
      <input type="password" id="password" placeholder="Password">
      <button id="login-btn">Login</button>
      <span class="switch-mode" id="to-register">Don't have an account? Register</span>
    </div>
  </div>`;
  document.body.insertAdjacentHTML('beforeend', overlayHtml);

  const loginOverlay = document.getElementById('login-overlay');

  document.getElementById('login-btn').addEventListener('click', () => {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    if(!email || !password){ alert('Enter both email & password'); return; }
    localStorage.setItem('loggedInUser', email);
    loginOverlay.remove();
    location.reload();
  });

  document.getElementById('to-register').addEventListener('click', () => {
    loginOverlay.remove();
    showRegisterModal();
  });
}

function showRegisterModal(){
  const overlayHtml = `
  <div class="modal-overlay" id="register-overlay">
    <div class="modal" id="register-modal">
      <h2>Register</h2>
      <input type="email" id="reg-email" placeholder="Email">
      <input type="password" id="reg-password" placeholder="Password">
      <button id="register-btn">Register</button>
      <span class="switch-mode" id="to-login">Already have an account? Login</span>
    </div>
  </div>`;
  document.body.insertAdjacentHTML('beforeend', overlayHtml);

  const regOverlay = document.getElementById('register-overlay');

  document.getElementById('register-btn').addEventListener('click', () => {
    const email = document.getElementById('reg-email').value;
    const password = document.getElementById('reg-password').value;
    if(!email || !password){ alert('Enter both email & password'); return; }
    localStorage.setItem('loggedInUser', email);
    regOverlay.remove();
    location.reload();
  });

  document.getElementById('to-login').addEventListener('click', () => {
    regOverlay.remove();
    showLoginModal();
  });
}
