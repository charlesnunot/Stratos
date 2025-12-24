// docs/components/Publish/FriendsModal.js
export function openFriendsModal(followers, textarea) {
  const modal = document.createElement('div')
  modal.style.cssText = `
    position:fixed;
    inset:0;
    background:rgba(0,0,0,.4);
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
  header.textContent = 'Mention followers'

  // Content
  const content = document.createElement('div')
  content.style.cssText = `
    padding:8px;
    flex:1;
    overflow:auto;
  `

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

  footer.append(cancelBtn, confirmBtn)

  // 无粉丝
  if (!followers || followers.length === 0) {
    const empty = document.createElement('div')
    empty.style.cssText = `
      padding:20px;
      text-align:center;
      color:#666;
      font-size:14px;
    `
    empty.textContent = "You don’t have any followers yet."
    content.appendChild(empty)

    box.append(header, content)
    modal.appendChild(box)
    modal.onclick = e => e.target === modal && document.body.removeChild(modal)
    document.body.appendChild(modal)
    return
  }

  // 有粉丝（多选）
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

    item.innerHTML = `
      <img src="${f.avatar_url}" width="32" height="32" style="border-radius:50%">
      <span>@${f.username}</span>
    `

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

  confirmBtn.onclick = () => {
    if (selected.size > 0) {
      textarea.value += ' ' + Array.from(selected).map(u => `@${u}`).join(' ') + ' '
    }
    document.body.removeChild(modal)
  }

  box.append(header, content, footer)
  modal.appendChild(box)

  modal.onclick = e => {
    if (e.target === modal) document.body.removeChild(modal)
  }

  document.body.appendChild(modal)
}

