// const baseURL = new URL('.', import.meta.url);

// export async function mountSearch(container) {
//   // 加载 HTML
//   const html = await fetch(new URL('Search.html', baseURL)).then(res => res.text());
//   container.innerHTML = html;

//   // 加载 CSS
//   loadCSS(new URL('Search.css', baseURL));

//   // 渲染搜索结果
//   const postsContainer = container.querySelector('.posts-feed');
//   const posts = ['Search Post 1', 'Search Post 2', 'Search Post 3'];
//   posts.forEach(post => {
//     const div = document.createElement('div');
//     div.className = 'post';
//     div.textContent = post;
//     postsContainer.appendChild(div);
//   });
// }

// function loadCSS(href) {
//   const url = href.toString();
//   if (document.querySelector(`link[href="${url}"]`)) return;
//   const link = document.createElement('link');
//   link.rel = 'stylesheet';
//   link.href = url;
//   document.head.appendChild(link);
// }

// docs/components/Posts/Search/Search.js
const baseURL = new URL('.', import.meta.url)

export async function mountSearch(container, cachedPosts = []) {
  if (cachedPosts.length) {
    container.innerHTML = renderPosts(cachedPosts)
    return cachedPosts
  }

  const posts = await fetchPosts()
  container.innerHTML = renderPosts(posts)
  return posts
}

async function fetchPosts() {
  return new Promise(resolve => {
    setTimeout(() => {
      resolve([
        { id: 201, content: 'Search Result 1' },
        { id: 202, content: 'Search Result 2' }
      ])
    }, 300)
  })
}

function renderPosts(posts) {
  return posts.map(p => `<div class="post-item" data-id="${p.id}">${p.content}</div>`).join('')
}
