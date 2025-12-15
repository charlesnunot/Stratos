const baseURL = new URL('.', import.meta.url);

export async function mountPublish(container) {
  if (!container) return;

  const html = await fetch(new URL('Publish.html', baseURL)).then(res => res.text());
  container.innerHTML = html;
  loadCSS(new URL('Publish.css', baseURL));

  const tabNormal = container.querySelector('#tab-normal');
  const tabProduct = container.querySelector('#tab-product');
  const contentArea = container.querySelector('#publish-content-area');

  loadNormalPost();

  tabNormal.addEventListener('click', () => {
    tabNormal.classList.add('active');
    tabProduct.classList.remove('active');
    loadNormalPost();
  });

  tabProduct.addEventListener('click', () => {
    tabProduct.classList.add('active');
    tabNormal.classList.remove('active');
    loadProductPost();
  });

  async function loadNormalPost() {
    const html = await fetch(new URL('NormalPost.html', baseURL)).then(res => res.text());
    contentArea.innerHTML = html;
    loadCSS(new URL('NormalPost.css', baseURL));

    const textarea = contentArea.querySelector('#normal-content');
    const submitBtn = contentArea.querySelector('#normal-submit');
    const feedback = contentArea.querySelector('#normal-feedback');

    submitBtn.addEventListener('click', () => {
      const content = textarea.value.trim();
      if (!content) {
        feedback.textContent = 'Content cannot be empty';
        feedback.style.color = 'red';
        return;
      }
      feedback.textContent = 'Normal post published!';
      feedback.style.color = 'green';
      textarea.value = '';
    });
  }

  async function loadProductPost() {
    const html = await fetch(new URL('ProductPost.html', baseURL)).then(res => res.text());
    contentArea.innerHTML = html;
    loadCSS(new URL('ProductPost.css', baseURL));

    const textarea = contentArea.querySelector('#product-content');
    const submitBtn = contentArea.querySelector('#product-submit');
    const feedback = contentArea.querySelector('#product-feedback');

    const productInfoBtn = contentArea.querySelector('#tool-product-info');
    const productInfoSection = contentArea.querySelector('#product-info');
    productInfoBtn.addEventListener('click', () => {
      productInfoSection.style.display =
        productInfoSection.style.display === 'none' ? 'flex' : 'none';
      productInfoSection.style.flexDirection = 'column';
    });

    submitBtn.addEventListener('click', () => {
      const content = textarea.value.trim();
      if (!content) {
        feedback.textContent = 'Content cannot be empty';
        feedback.style.color = 'red';
        return;
      }
      const productData = {
        title: contentArea.querySelector('#product-title')?.value,
        description: contentArea.querySelector('#product-description')?.value,
        price: contentArea.querySelector('#product-price')?.value,
        stock: contentArea.querySelector('#product-stock')?.value,
        shipping: contentArea.querySelector('#product-shipping')?.value,
        link: contentArea.querySelector('#product-link')?.value,
        condition: contentArea.querySelector('#product-condition')?.value,
      };
      console.log('Published Product Post:', content, productData);
      feedback.textContent = 'Product post published!';
      feedback.style.color = 'green';
      textarea.value = '';
    });
  }
}

function loadCSS(href) {
  const url = href.toString();
  if (document.querySelector(`link[href="${url}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = url;
  document.head.appendChild(link);
}
