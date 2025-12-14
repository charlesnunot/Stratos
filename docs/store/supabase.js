// docs/app/supabase.js
const SUPABASE_URL = 'https://zquslphbmowkgrdlygza.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_oaojowgzWjzLUAUhA7rjfw_hntjdrcu';

// 使用 window.supabase 方式（UMD）
export const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
