const SUPABASE_URL = 'https://zquslphbmowkgrdlygza.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_oaojowgzWjzLUAUhA7rjfw_hntjdrcu';
export const supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function defaultAvatar() {
  return 'https://res.cloudinary.com/dpgkgtb5n/image/upload/v1763533800/n0ennkuiissnlhyhtht8.jpg';
}

export async function getUserAvatar(uid) {
  if (!uid) return defaultAvatar();
  try {
    const { data, error } = await supabase
      .from('user_avatars')
      .select('avatar_url')
      .eq('uid', uid);
    if (error || !data || data.length === 0) return defaultAvatar();
    return data[0].avatar_url;
  } catch {
    return defaultAvatar();
  }
}

export async function getUserProfile(uid) {
  try {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('uid', uid)
      .maybeSingle();
    if (error) return null;
    return data || null;
  } catch {
    return null;
  }
}

export async function upsertUserProfile(profile) {
  try {
    const { data, error } = await supabase
      .from('user_profiles')
      .upsert(profile, { onConflict: 'uid' })
      .select('*')
      .maybeSingle();
    if (error) return null;
    return data || null;
  } catch {
    return null;
  }
}
