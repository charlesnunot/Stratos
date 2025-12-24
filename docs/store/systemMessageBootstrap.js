// docs/store/systemMessageBootstrap.js
import { fetchSystemMessages } from './systemMessageApi.js'
import { setSystemMessages } from './systemMessageStore.js'

export async function initSystemMessages(user) {
  if (!user) return

  const { system, dynamic } = await fetchSystemMessages(user.id)

  setSystemMessages('system', system)
  setSystemMessages('dynamic', dynamic)
}

