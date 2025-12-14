// docs/store/state.js
export const state = {
  user: {
    uid: null,
    username: null,
    avatar: null,
    isOnline: false
  },

  ui: {
    currentPage: 'home',
    sidebarCollapsed: false,
    isMobile: false
  },

  messages: {
    currentTab: 'system',
    list: [],
    currentMessage: null
  },

  notifications: {
    unreadCount: 0
  }
};

