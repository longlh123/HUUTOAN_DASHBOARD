import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ItemCatalogEntry } from '../api/sales'
import { fetchItemCatalog } from '../api/sales'

type Row = {
  id: string
  item: ItemCatalogEntry | null
  query: string
  qty: string
  remark: string
}

const DRAFT_KEY = 'ht_material_entry_draft'

function loadDraft(): Row[] | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) && parsed.length ? parsed : null
  } catch {
    return null
  }
}

function saveDraft(rows: Row[]): void {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(rows)) } catch { /* ignore */ }
}

function emptyRow(): Row {
  return { id: `r${Date.now()}${Math.random().toString(36).slice(2, 6)}`, item: null, query: '', qty: '', remark: '' }
}

function rowComplete(row: Row): boolean {
  return !!row.item && row.qty !== '' && !isNaN(parseFloat(row.qty))
}

// ── Item combobox — giống UserCombobox (KpiSettingsPage) nhưng search từ erp_synced_items ──
function ItemCombobox({ value, query, onQueryChange, onSelect }: {
  value:         ItemCatalogEntry | null
  query:         string
  onQueryChange: (q: string) => void
  onSelect:      (item: ItemCatalogEntry) => void
}) {
  const [open, setOpen] = useState(false)
  const [results, setResults] = useState<ItemCatalogEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Dropdown render qua portal (document.body) vi input nam trong .table-wrap co
  // overflow-x: auto — CSS buoc overflow-y cung thanh auto theo, nen position:absolute
  // lồng trong do se bi clip mat phan tran xuong duoi bang.
  function updatePos() {
    const r = wrapRef.current?.getBoundingClientRect()
    if (r) setPos({ top: r.bottom + 4, left: r.left, width: Math.max(r.width, 260) })
  }

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  useEffect(() => {
    if (!open) return
    updatePos()
    window.addEventListener('scroll', updatePos, true)
    window.addEventListener('resize', updatePos)
    return () => {
      window.removeEventListener('scroll', updatePos, true)
      window.removeEventListener('resize', updatePos)
    }
  }, [open])

  function handleChange(q: string) {
    onQueryChange(q)
    setOpen(true)
    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (!q.trim()) {
      setResults([])
      return
    }

    setLoading(true)
    debounceRef.current = setTimeout(async () => {
      try {
        setResults(await fetchItemCatalog(q.trim()))
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 300)
  }

  function select(item: ItemCatalogEntry) {
    onSelect(item)
    setOpen(false)
  }

  return (
    <div className="combobox" ref={wrapRef}>
      <input
        className="kpi-settings__input combobox__input material-entry__name-input"
        type="text"
        placeholder="Gõ mã hoặc tên vật tư..."
        value={query}
        onChange={e => handleChange(e.target.value)}
        onFocus={() => setOpen(true)}
        autoComplete="off"
      />
      {open && query.trim() && pos && createPortal(
        loading ? (
          <div className="combobox__empty material-entry__ac-portal" style={{ top: pos.top, left: pos.left, minWidth: pos.width }}>
            Đang tìm...
          </div>
        ) : results.length === 0 ? (
          <div className="combobox__empty material-entry__ac-portal" style={{ top: pos.top, left: pos.left, minWidth: pos.width }}>
            Không tìm thấy vật tư khớp "{query}"
          </div>
        ) : (
          <ul className="combobox__list material-entry__ac-portal" style={{ top: pos.top, left: pos.left, minWidth: pos.width }}>
            {results.map(item => (
              <li
                key={item.item_number}
                className={`combobox__item${value?.item_number === item.item_number ? ' combobox__item--active' : ''}`}
                onMouseDown={() => select(item)}
              >
                <span className="combobox__item-name">{item.name}</span>
                <span className="combobox__item-meta">{item.item_number} · ĐVT {item.unit || '—'}</span>
              </li>
            ))}
          </ul>
        ),
        document.body
      )}
    </div>
  )
}

export function MaterialEntryPage() {
  const [quoteRef, setQuoteRef] = useState('')
  const [groupLabel, setGroupLabel] = useState('')
  const [rows, setRows] = useState<Row[]>(() => loadDraft() ?? [emptyRow()])
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { saveDraft(rows) }, [rows])

  function updateRow(id: string, patch: Partial<Row>) {
    setRows(rs => rs.map(r => (r.id === id ? { ...r, ...patch } : r)))
  }

  function addRow() {
    setRows(rs => [...rs, emptyRow()])
  }

  function removeRow(id: string) {
    setRows(rs => rs.filter(r => r.id !== id))
  }

  function showToast(msg: string) {
    setToast(msg)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 4000)
  }

  function handleSave() {
    const valid = rows.filter(rowComplete)
    showToast(
      quoteRef.trim()
        ? `Demo: sẽ tạo ${valid.length} dòng Quote Product cho ${quoteRef.trim()} (chưa kết nối CRM thật).`
        : 'Nhập mã Quote/WO trước khi lưu.'
    )
  }

  const totalCount = rows.length
  const validCount = rows.filter(rowComplete).length

  return (
    <div className="dashboard">
      <div className="dashboard__header">
        <div>
          <h1 className="dashboard__title">Vật tư lắp đặt</h1>
          <p className="material-entry__subtitle">
            Nhập tay danh sách vật tư thi công cho 1 Quote/Work Order — thay cho file BOQ Excel. Chọn vật tư từ danh mục F&amp;O để tránh gõ sai mã/tên.
          </p>
        </div>
        <span className="material-entry__demo-pill">Demo — chưa nối CRM thật</span>
      </div>

      <div className="card">
        <div className="material-entry__field-grid">
          <label className="material-entry__field">
            <span className="material-entry__field-label">Mã Quote / Work Order</span>
            <input
              className="kpi-settings__input material-entry__name-input"
              placeholder="VD: Q260721235"
              value={quoteRef}
              onChange={e => setQuoteRef(e.target.value)}
            />
          </label>
          <label className="material-entry__field">
            <span className="material-entry__field-label">Nhóm vật tư (ghi chú)</span>
            <input
              className="kpi-settings__input material-entry__name-input"
              placeholder="VD: Vật tư gia công lắp đặt"
              value={groupLabel}
              onChange={e => setGroupLabel(e.target.value)}
            />
          </label>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-wrap">
          <table className="leaderboard material-entry__table">
            <thead>
              <tr>
                <th style={{ width: 110 }}>Item Code</th>
                <th>Mô tả vật tư</th>
                <th style={{ width: 70 }}>ĐVT</th>
                <th style={{ width: 100, textAlign: 'right' }}>Số lượng</th>
                <th>Ghi chú</th>
                <th style={{ width: 36 }}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => {
                const incomplete = !rowComplete(row) && (row.query || row.qty)
                return (
                  <tr key={row.id} className={incomplete ? 'material-entry__row--incomplete' : ''}>
                    <td>
                      <span className={row.item ? 'material-entry__code' : 'material-entry__code material-entry__code--empty'}>
                        {row.item?.item_number || 'chưa chọn'}
                      </span>
                    </td>
                    <td>
                      <ItemCombobox
                        value={row.item}
                        query={row.query}
                        onQueryChange={q => updateRow(row.id, { query: q, item: null })}
                        onSelect={item => updateRow(row.id, { item, query: item.name ?? item.item_number })}
                      />
                    </td>
                    <td className={row.item?.unit ? undefined : 'material-entry__muted'}>{row.item?.unit || '—'}</td>
                    <td style={{ textAlign: 'right' }}>
                      <input
                        className="kpi-settings__input material-entry__qty"
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        value={row.qty}
                        onChange={e => updateRow(row.id, { qty: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        className="kpi-settings__input material-entry__name-input"
                        placeholder="Ghi chú (tuỳ chọn)"
                        value={row.remark}
                        onChange={e => updateRow(row.id, { remark: e.target.value })}
                      />
                    </td>
                    <td>
                      <button
                        className="material-entry__remove-btn"
                        type="button"
                        aria-label="Xoá dòng"
                        onClick={() => removeRow(row.id)}
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="material-entry__footer">
          <span>{totalCount} dòng · {validCount} dòng đã đủ thông tin</span>
          <button className="kpi-settings__save-btn" type="button" onClick={addRow}>+ Thêm dòng</button>
        </div>
      </div>

      <div className="material-entry__save-row">
        <button
          className="kpi-settings__save-btn"
          type="button"
          disabled={totalCount === 0 || validCount !== totalCount}
          onClick={handleSave}
        >
          Lưu vào CRM
        </button>
      </div>

      {toast && <div className="material-entry__toast">{toast}</div>}
    </div>
  )
}
