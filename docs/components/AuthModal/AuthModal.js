const baseURL = new URL('.', import.meta.url);

export const AuthModal = (() => {
  let modalContainer;

  function init() {
    if (modalContainer) return;

    // 加载 HTML
    fetch(new URL('AuthModal.html', baseURL))
      .then(res => res.text())
      .then(html => {
        document.body.insertAdjacentHTML('beforeend', html);
        modalContainer = document.getElementById('auth-modal');
        bindEvents();
      });
    
    // 加载 CSS
    loadCSS(new URL('AuthModal.css', baseURL));
  }

  function bindEvents() {
    if (!modalContainer) return;

    const closeBtn = modalContainer.querySelector('.auth-close');
    const loginForm = modalContainer.querySelector('#login-form');
    const registerForm = modalContainer.querySelector('#register-form');
    const switchToRegister = modalContainer.querySelector('#switch-to-register');
    const switchToLogin = modalContainer.querySelector('#switch-to-login');

    // 关闭模态
    closeBtn.addEventListener('click', () => hide());

    // 切换注册/登录
    switchToRegister.addEventListener('click', () => {
      loginForm.classList.remove('active');
      registerForm.classList.add('active');
    });

    switchToLogin.addEventListener('click', () => {
      registerForm.classList.remove('active');
      loginForm.classList.add('active');
    });

    // 登录提交
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = loginForm.querySelector('#login-email').value;
      const password = loginForm.querySelector('#login-password').value;

      console.log('登录提交', email, password);
      // TODO: 调用你的登录逻辑
    });

    // 注册提交
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = registerForm.querySelector('#register-email').value;
      const password = registerForm.querySelector('#register-password').value;

      console.log('注册提交', email, password);
      // TODO: 调用你的注册逻辑
    });

    // 点击背景关闭
    modalContainer.addEventListener('click', (e) => {
      if (e.target === modalContainer) hide();
    });
  }

  function open(type = 'login') {
    init();
    if (!modalContainer) return;

    const loginForm = modalContainer.querySelector('#login-form');
    const registerForm = modalContainer.querySelector('#register-form');

    if (type === 'login') {
      loginForm.classList.add('active');
      registerForm.classList.remove('active');
    } else {
      loginForm.classList.remove('active');
      registerForm.classList.add('active');
    }

    modalContainer.style.display = 'flex';
  }

  function hide() {
    if (!modalContainer) return;
    modalContainer.style.display = 'none';
  }

  function loadCSS(href) {
    const url = href.toString();
    if (document.querySelector(`link[href="${url}"]`)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = url;
    document.head.appendChild(link);
  }

  return { open, hide };
})();

