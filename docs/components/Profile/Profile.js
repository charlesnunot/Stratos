const baseURL = new URL('.', import.meta.url);

export async function mountProfile(container) {
  if (!container) return;

  // Load HTML
  const html = await fetch(new URL('Profile.html', baseURL)).then(res => res.text());
  container.innerHTML = html;

  // Load CSS
  loadCSS(new URL('Profile.css', baseURL));

  // Elements
  const usernameEl = container.querySelector('#profile-username');
  const bioEl = container.querySelector('#profile-bio');
  const followersEl = container.querySelector('#profile-followers');
  const scoreEl = container.querySelector('#profile-score');
  const likesEl = container.querySelector('#profile-likes');
  const postsArea = container.querySelector('#profile-posts-area');
  const postTabs = container.querySelectorAll('.post-tab');

  // Simulate fetching user data
  const userData = await fetchUserData();
  usernameEl.textContent = userData.username;
  bioEl.textContent = userData.bio;
  followersEl.textContent = `Followers: ${userData.followers}`;
  scoreEl.textContent = `Score: ${userData.score}`;
  likesEl.textContent = `Likes: ${userData.likes}`;

  // Handle post tab clicks
  postTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      postTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      loadPosts(tab.dataset.type, postsArea);
    });
  });

  // Load default tab
  loadPosts('posts', postsArea);
}

// Simulate fetching user data
async function fetchUserData() {
  return new Promise(resolve => {
    setTimeout(() => {
      resolve({
        username: 'JohnDoe',
        bio: 'This is a sample bio for the profile.',
        followers: 123,
        score: 456,
        likes: 789
      });
    }, 300);
  });
}

// Simulate posts content based on type
function loadPosts(type, container) {
  container.innerHTML = ''; // clear
  let items = [];
  switch(type) {
    case 'posts':
      items = ['Post 1: Hello world!', 'Post 2: Another update'];
      break;
    case 'products':
      items = ['Product 1', 'Product 2', 'Product 3'];
      break;
    case 'collections':
      items = ['Collected Post A', 'Collected Post B'];
      break;
    case 'shares':
      items = ['Shared Post X', 'Shared Post Y'];
      break;
    case 'likes':
      items = ['Liked Post Alpha', 'Liked Post Beta'];
      break;
  }

  const ul = document.createElement('ul');
  ul.style.listStyle = 'none';
  ul.style.padding = '0';
  items.forEach(it => {
    const li = document.createElement('li');
    li.textContent = it;
    li.style.padding = '8px';
    li.style.borderBottom = '1px solid #eee';
    ul.appendChild(li);
  });
  container.appendChild(ul);
}

// Load CSS helper
function loadCSS(href) {
  const url = href.toString();
  if (document.querySelector(`link[href="${url}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = url;
  document.head.appendChild(link);
}
