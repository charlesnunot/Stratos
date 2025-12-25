// 页面注册表
// 所有页面模块都统一在这里注册
// 每个页面模块必须实现 mount(container, savedState) 和 saveState()

import * as HomePage from '../components/Home/Home.js'
import * as MarketPage from '../components/Market/Market.js'
import * as ProfilePage from '../components/Profile/Profile.js'
import * as MessagesPage from '../components/Messages/Messages.js'
import * as PublishPage from '../components/Publish/Publish.js'

export const pageRegistry = {
  home: HomePage,
  market: MarketPage,
  profile: ProfilePage,
  messages: MessagesPage,
  publish: PublishPage
}

