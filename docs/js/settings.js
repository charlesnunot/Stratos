// 获取当前用户信息
async function getUserProfile() {
  const token = localStorage.getItem('authToken');
  const { data, error } = await supabase.auth.getUser(token);

  if (error) {
    console.error('Error fetching user data:', error);
    return null;
  }

  return data;
}

// 更新用户资料
async function updateUserProfile() {
  const user = await getUserProfile();
  if (!user) return;

  const username = document.getElementById('username').value;
  const avatarFile = document.getElementById('avatar').files[0];

  let avatarUrl = '';

  if (avatarFile) {
    // 假设头像上传到 Supabase 存储
    const { data, error } = await supabase.storage
      .from('avatars')
      .upload(`avatars/${user.id}.jpg`, avatarFile);

    if (error) {
      console.error('Avatar upload failed:', error);
      return;
    }

    avatarUrl = data.Key;
  }

  const { data, error } = await supabase
    .from('user_profiles')
    .upsert({
      uid: user.id,
      nickname: username,
      avatar_url: avatarUrl || user.avatar_url, // 保持原头像，如果没有新头像
    })
    .select('*')
    .maybeSingle();

  if (error) {
    console.error('Failed to update profile:', error);
  } else {
    alert('Profile updated successfully!');
  }
}

document.getElementById('settings-form').addEventListener('submit', (e) => {
  e.preventDefault();
  updateUserProfile();
});

