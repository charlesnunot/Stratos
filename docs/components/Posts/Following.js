// import { mountPostsFeed } from './PostsFeed.js';

// export function mountFollowing(container) {
//   const posts = [
//     { title: 'Following Post 1', author: 'Dave', time: '1h ago', excerpt: 'This is the first following post.' },
//     { title: 'Following Post 2', author: 'Eve', time: '2h ago', excerpt: 'This is the second following post.' },
//     { title: 'Following Post 3', author: 'Frank', time: '3h ago', excerpt: 'This is the third following post.' }
//   ];

//   mountPostsFeed(container, posts);
// }

// docs/components/Posts/Following.js
const baseURL = new URL('.', import.meta.url)

export async function mountFollowing(container, cachedPosts = []) {
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
        { id: 101, content: 'Following Post 1' },
        { id: 102, content: 'Following Post 2' }
      ])
    }, 300)
  })
}

function renderPosts(posts) {
  return posts.map(p => `<div class="post-item" data-id="${p.id}">${p.content}</div>`).join('')
}
