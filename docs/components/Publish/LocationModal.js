// docs/components/Publish/LocationModal.js
export function openLocationModal(onSelect) {
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
    border-radius:8px;
    overflow:hidden;
    display:flex;
    flex-direction:column;
  `

  // Header
  const header = document.createElement('div')
  header.style.cssText = `
    padding:10px 12px;
    font-weight:600;
    border-bottom:1px solid #eee;
  `
  header.textContent = 'Add location'

  // Content
  const content = document.createElement('div')
  content.style.cssText = `
    padding:12px;
    display:flex;
    flex-direction:column;
    gap:12px;
  `

  const input = document.createElement('input')
  input.placeholder = 'Enter a location'
  input.style.cssText = `
    padding:8px;
    border:1px solid #ccc;
    border-radius:6px;
  `

  const manualBtn = document.createElement('button')
  manualBtn.textContent = 'Confirm'
  manualBtn.style.cssText = `
    padding:8px;
    background:#1da1f2;
    color:#fff;
    border:none;
    border-radius:6px;
    cursor:pointer;
  `
  manualBtn.onclick = () => {
    if (!input.value.trim()) return
    onSelect({ name: input.value.trim(), source: 'manual' })
    document.body.removeChild(modal)
  }

  const ipBtn = document.createElement('button')
  ipBtn.textContent = 'Use my location'
  ipBtn.style.cssText = `
    padding:8px;
    background:#f5f8fa;
    border:1px solid #ccc;
    border-radius:6px;
    cursor:pointer;
  `
  ipBtn.onclick = async () => {
    ipBtn.textContent = 'Locating...'
    try {
      const res = await fetch('https://ipapi.co/json/')
      const data = await res.json()
      const name = [data.city, data.region, data.country_name].filter(Boolean).join(', ')
      onSelect({ name, source: 'ip' })
      document.body.removeChild(modal)
    } catch {
      ipBtn.textContent = 'Failed to locate'
    }
  }

  content.append(input, manualBtn, ipBtn)
  box.append(header, content)
  modal.appendChild(box)

  modal.onclick = e => {
    if (e.target === modal) document.body.removeChild(modal)
  }

  document.body.appendChild(modal)
}

