// docs/components/Publish/VisibilityModal.js
import { getUser } from '../../store/userManager.js'  // 修复未定义报错
import { getUserFollowers } from '../../store/api.js'

/**
 * 打开选择帖子可见性的弹窗
 * @param {'public'|'friends'|'onlyme'|'show'|'hide'} currentVisibility
 * @param {(selection: {type: string, users?: string[]}) => void} onSelect
 */
export async function openVisibilityModal(currentVisibility, onSelect) {
  const modal = document.createElement('div')
  modal.style.cssText = `
    position:fixed;
    inset:0;
    background:rgba(0,0,0,0.4);
    display:flex;
    justify-content:center;
    align-items:center;
    z-index:9999;
  `

  const box = document.createElement('div')
  box.style.cssText = `
    background:#fff;
    width:280px;
    border-radius:8px;
    overflow:hidden;
    display:flex;
    flex-direction:column;
  `

  // Header
  const header = document.createElement('div')
  header.style.cssText = `
    padding:12px;
    font-weight:600;
    border-bottom:1px solid #eee;
  `
  header.textContent = 'Select Visibility'

  // Content
  const content = document.createElement('div')
  content.style.cssText = `
    display:flex;
    flex-direction:column;
    gap:6px;
    padding:8px 12px;
  `

  const options = [
    { label: 'Public', icon: 'public', type: 'public' },
    { label: 'Friends only', icon: 'groups', type: 'friends' },
    { label: 'Only me', icon: 'lock', type: 'onlyme' },
    { divider: true },
    { label: 'Show to', icon: 'visibility', type: 'show' },
    { label: 'Hide from', icon: 'visibility_off', type: 'hide' }
  ]

  options.forEach(opt => {
    if (opt.divider) {
      const div = document.createElement('div')
      div.style.cssText = 'height:1px;background:#eee;margin:4px 0;'
      content.appendChild(div)
      return
    }

    const item = document.createElement('div')
    item.style.cssText = `
      display:flex;
      align-items:center;
      gap:8px;
      padding:8px;
      border-radius:6px;
      cursor:pointer;
    `
    item.innerHTML = `<span class="material-symbols-outlined">${opt.icon}</span><span>${opt.label}</span>`

    item.onclick = async () => {
      if (opt.type === 'show' || opt.type === 'hide') {
        const user = await getUser()
        if (!user) return alert('Please login first')
        const followers = await getUserFollowers(user.id)
        openFriendsSelector(followers, opt.type, selectedUsers => {
          onSelect({ type: opt.type, users: selectedUsers })
          document.body.removeChild(modal)
        })
      } else {
        onSelect({ type: opt.type })
        document.body.removeChild(modal)
      }
    }

    content.appendChild(item)
  })

  box.append(header, content)
  modal.appendChild(box)

  modal.onclick = e => {
    if (e.target === modal) document.body.removeChild(modal)
  }

  document.body.appendChild(modal)
}

// ======================================
// 粉丝多选弹窗
// ======================================
function openFriendsSelector(followers, type, callback) {
  const modal = document.createElement('div')
  modal.style.cssText = `
    position:fixed;
    inset:0;
    background:rgba(0,0,0,0.4);
    display:flex;
    justify-content:center;
    align-items:center;
    z-index:9999;
  `

  const box = document.createElement('div')
  box.style.cssText = `
    background:#fff;
    width:320px;
    max-height:420px;
    display:flex;
    flex-direction:column;
    border-radius:8px;
    overflow:hidden;
  `

  // Header
  const header = document.createElement('div')
  header.style.cssText = `
    padding:10px 12px;
    font-weight:600;
    border-bottom:1px solid #eee;
  `
  header.textContent = type === 'show' ? 'Show to followers' : 'Hide from followers'

  // Content
  const content = document.createElement('div')
  content.style.cssText = `
    padding:8px;
    flex:1;
    overflow:auto;
  `

  const selected = new Set()
  followers.forEach(f => {
    const item = document.createElement('div')
    item.style.cssText = `
      display:flex;
      align-items:center;
      gap:8px;
      padding:6px;
      border-radius:6px;
      cursor:pointer;
    `
    item.innerHTML = `<img src="${f.avatar_url}" width="32" height="32" style="border-radius:50%"><span>@${f.username}</span>`
    item.onclick = () => {
      if (selected.has(f.username)) {
        selected.delete(f.username)
        item.style.background = ''
      } else {
        selected.add(f.username)
        item.style.background = 'rgba(29,161,242,0.12)'
      }
    }
    content.appendChild(item)
  })

  // Footer
  const footer = document.createElement('div')
  footer.style.cssText = `
    padding:8px;
    display:flex;
    justify-content:flex-end;
    gap:8px;
    border-top:1px solid #eee;
  `
  const cancelBtn = document.createElement('button')
  cancelBtn.textContent = 'Cancel'
  cancelBtn.onclick = () => document.body.removeChild(modal)
  const confirmBtn = document.createElement('button')
  confirmBtn.textContent = 'Confirm'
  confirmBtn.style.cssText = `
    background:#1da1f2;
    color:#fff;
    border:none;
    padding:6px 12px;
    border-radius:6px;
    cursor:pointer;
  `
  confirmBtn.onclick = () => {
    callback(Array.from(selected))
    document.body.removeChild(modal)
  }

  footer.append(cancelBtn, confirmBtn)
  box.append(header, content, footer)
  modal.appendChild(box)

  modal.onclick = e => { if (e.target === modal) document.body.removeChild(modal) }

  document.body.appendChild(modal)
}
