// docs/store/systemMessageApi.js
import { supabase } from './supabase.js'

/**
 * 拉取系统消息（含已读状态 + metadata）
 */
export async function fetchSystemMessages(uid) {
  const { data, error } = await supabase
    .from('system_messages')
    .select(`
      id,
      title,
      content,
      type,
      message_scope,
      target_user,
      priority,
      created_at,
      system_message_reads!left(user_id),
      system_message_metadata (
        icon_url,
        action_url,
        extra
      )
    `)
    .or(`message_scope.eq.broadcast,target_user.eq.${uid}`)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[SystemMessage] fetch error', error)
    return { system: [], dynamic: [] }
  }

  return normalizeMessages(data, uid)
}

/**
 * 标记已读
 */
export async function markSystemMessageRead(uid, messageId) {
  const { error } = await supabase
    .from('system_message_reads')
    .insert({ user_id: uid, message_id: messageId })

  if (error) {
    // 已存在不算错误
    if (error.code !== '23505') {
      console.error('[SystemMessage] mark read error', error)
    }
  }
}

/**
 * 归一化到前端模型
 */
function normalizeMessages(rows, uid) {
  const system = []
  const dynamic = []

  rows.forEach(row => {
    const isRead = row.system_message_reads?.length > 0

    const msg = {
      id: row.id,
      title: row.title,
      content: row.content,
      is_read: isRead,
      created_at: row.created_at,
      icon_url: row.system_message_metadata?.icon_url || null,
      action_url: row.system_message_metadata?.action_url || null,
      extra: row.system_message_metadata?.extra || null
    }

    // 语义分类（你可以随时扩展）
    if (['announcement', 'reminder', 'promotion'].includes(row.type)) {
      system.push(msg)
    } else {
      dynamic.push(msg)
    }
  })

  return { system, dynamic }
}

