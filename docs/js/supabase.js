// js/supabase.js
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/supabase.min.js';

const SUPABASE_URL = 'https://zquslphbmowkgrdlygza.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_oaojowgzWjzLUAUhA7rjfw_hntjdrcu';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

