// docs/store/actions.js
import { state } from './state.js';
import { notify } from './subscribers.js';

export const actions = {
  setUser(user) {
    state.user = { ...state.user, ...user };
    notify(state, 'user');
  },

  logout() {
    state.user = {
      uid: null,
      username: null,
      avatar: null,
      isOnline: false
    };
    notify(state, 'user');
  },

  setCurrentPage(page) {
    state.ui.currentPage = page;
    notify(state, 'ui.currentPage');
  },

  setMessages(messages) {
    state.messages.list = messages;
    notify(state, 'messages.list');
  },

  setCurrentMessage(message) {
    state.messages.currentMessage = message;
    notify(state, 'messages.currentMessage');
  },

  setMessageTab(tab) {
    state.messages.currentTab = tab;
    notify(state, 'messages.currentTab');
  }
};

