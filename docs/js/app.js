import { mountSidebar } from '../components/Sidebar/Sidebar.js';
import { mountMain } from '../components/Main/Main.js';
import { mountExtra } from '../components/Extra/Extra.js';

mountSidebar(document.getElementById('sidebar-root'));
mountMain(document.getElementById('main-root'));
mountExtra(document.getElementById('extra-root'));

