// /docs/js/app.js
import { supabase, getCurrentUser, onAuthChange } from '../store/supabase.js'
import { setUser, clearUser, getUser, subscribe } from '../store/userManager.js'
import { mountSidebar } from '../components/Sidebar/Sidebar.js';
mountSidebar(document.getElementById('sidebar-root'));
