import { Fragment, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ItemCatalogEntry } from '../api/sales'
import { fetchItemCatalog } from '../api/sales'
import type { ItemLevelOption } from '../api/items'
import { fetchItemLevel1Options, fetchItemLevel2Options } from '../api/items'

type Row = {
  id: string
  item: ItemCatalogEntry | null
  query: string
  qty: string
  remark: string
  level1: number | null
  level2: number | null
}

// 1 "thanh pham" (vd "Hộp thoát nhiệt KT: 1040x600mm") — tuong ung dong in dam khong co Item Code
// trong file BOQ Excel goc, gom nhieu dong vat tu cau thanh ben duoi. Vat tu KHONG thuoc thanh pham
// nao thi nam thang trong danh sach rieng (looseRows), khong bat buoc phai co thanh pham.
type Product = {
  id: string
  name: string
  rows: Row[]
}

type Draft = {
  looseRows: Row[]
  products: Product[]
}

const DRAFT_KEY = 'ht_material_entry_draft'

function loadDraft(): Draft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    // Draft cu (truoc khi tach thanh pham/vat tu roi) co cau truc khac — bo qua thay vi crash.
    const isValid = parsed && Array.isArray(parsed.looseRows) && Array.isArray(parsed.products)
    return isValid ? parsed : null
  } catch {
    return null
  }
}

function saveDraft(draft: Draft): void {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)) } catch { /* ignore */ }
}

function emptyRow(): Row {
  return {
    id: `r${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
    item: null, query: '', qty: '', remark: '',
    level1: null, level2: null,
  }
}

function emptyProduct(): Product {
  return {
    id: `p${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
    name: '',
    rows: [],
  }
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

// ── 1 dong vat tu — dung chung cho ca vat tu roi lan vat tu ben trong 1 nhom ──
function MaterialRowTr({ row, level1Options, level2Options, onUpdateRow, onRemoveRow }: {
  row:            Row
  level1Options:  ItemLevelOption[]
  level2Options:  ItemLevelOption[]
  onUpdateRow:    (patch: Partial<Row>) => void
  onRemoveRow:    () => void
}) {
  const incomplete = !rowComplete(row) && (row.query || row.qty)
  return (
    <tr className={incomplete ? 'material-entry__row--incomplete' : ''}>
      <td>
        <span className={row.item ? 'material-entry__code' : 'material-entry__code material-entry__code--empty'}>
          {row.item?.item_number || 'chưa chọn'}
        </span>
      </td>
      <td>
        <div style={{ display: 'flex', gap: 6 }}>
          <div style={{ flex: 2 }}>
            <ItemCombobox
              value={row.item}
              query={row.query}
              onQueryChange={q => onUpdateRow({ query: q, item: null, level1: null, level2: null })}
              onSelect={item => onUpdateRow({
                item, query: item.name ?? item.item_number,
                // Neu erp_installation_items da ghi nhan san level1/2 cho item nay thi mac dinh
                // chon theo, con khong co thi de trong cho nguoi dung tu nhap.
                level1: item.level1 ?? null,
                level2: item.level2 ?? null,
              })}
            />
          </div>
          <select
            className="kpi-settings__input"
            style={{ flex: 1, textAlign: 'left' }}
            value={row.level1 ?? ''}
            onChange={e => onUpdateRow({ level1: e.target.value ? Number(e.target.value) : null })}
          >
            <option value="">Level 1</option>
            {level1Options.map(o => <option key={o.code} value={o.code}>{o.label}</option>)}
          </select>
          <select
            className="kpi-settings__input"
            style={{ flex: 1, textAlign: 'left' }}
            value={row.level2 ?? ''}
            onChange={e => onUpdateRow({ level2: e.target.value ? Number(e.target.value) : null })}
          >
            <option value="">Level 2</option>
            {level2Options.map(o => <option key={o.code} value={o.code}>{o.label}</option>)}
          </select>
        </div>
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
          onChange={e => onUpdateRow({ qty: e.target.value })}
        />
      </td>
      <td>
        <input
          className="kpi-settings__input material-entry__name-input"
          placeholder="Ghi chú (tuỳ chọn)"
          value={row.remark}
          onChange={e => onUpdateRow({ remark: e.target.value })}
        />
      </td>
      <td>
        <button className="material-entry__remove-btn" type="button" aria-label="Xoá dòng" onClick={onRemoveRow}>
          ✕
        </button>
      </td>
    </tr>
  )
}

// ── Dong tieu de 1 nhom (highlight nen) — ten nhom + nut them vat tu/xoa nhom ──
function GroupHeaderTr({ name, index, onRename, onAddRow, onRemove }: {
  name:      string
  index:     number
  onRename:  (name: string) => void
  onAddRow:  () => void
  onRemove:  () => void
}) {
  return (
    <tr className="material-entry__group-row">
      <td colSpan={2}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontWeight: 600, color: 'var(--text-muted)', fontSize: 13, whiteSpace: 'nowrap' }}>📁 Nhóm #{index + 1}</span>
          <input
            className="kpi-settings__input material-entry__name-input"
            style={{ flex: 1, fontWeight: 600, textAlign: 'left' }}
            placeholder='Tên nhóm — VD: Hộp thoát nhiệt KT: 1040x600mm'
            value={name}
            onChange={e => onRename(e.target.value)}
          />
        </div>
      </td>
      <td colSpan={3}></td>
      <td style={{ whiteSpace: 'nowrap' }}>
        <button className="material-entry__add-icon-btn" type="button" aria-label="Thêm vật tư vào nhóm" onClick={onAddRow}>+</button>
        <button className="material-entry__remove-btn" type="button" aria-label="Xoá nhóm" onClick={onRemove}>✕</button>
      </td>
    </tr>
  )
}

export function MaterialEntryPage() {
  const [quoteRef, setQuoteRef] = useState('')
  const [groupLabel, setGroupLabel] = useState('')
  const [looseRows, setLooseRows] = useState<Row[]>(() => loadDraft()?.looseRows ?? [emptyRow()])
  const [products, setProducts] = useState<Product[]>(() => loadDraft()?.products ?? [])
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [level1Options, setLevel1Options] = useState<ItemLevelOption[]>([])
  const [level2Options, setLevel2Options] = useState<ItemLevelOption[]>([])

  useEffect(() => {
    fetchItemLevel1Options().then(setLevel1Options).catch(() => { /* ignore — combobox chi la tien ich */ })
    fetchItemLevel2Options().then(setLevel2Options).catch(() => { /* ignore — combobox chi la tien ich */ })
  }, [])

  useEffect(() => { saveDraft({ looseRows, products }) }, [looseRows, products])

  function updateLooseRow(rowId: string, patch: Partial<Row>) {
    setLooseRows(rs => rs.map(r => (r.id === rowId ? { ...r, ...patch } : r)))
  }

  function addLooseRow() {
    setLooseRows(rs => [...rs, emptyRow()])
  }

  function removeLooseRow(rowId: string) {
    setLooseRows(rs => rs.filter(r => r.id !== rowId))
  }

  function updateProduct(productId: string, patch: Partial<Product>) {
    setProducts(ps => ps.map(p => (p.id === productId ? { ...p, ...patch } : p)))
  }

  function addProduct() {
    setProducts(ps => [...ps, emptyProduct()])
  }

  function removeProduct(productId: string) {
    setProducts(ps => ps.filter(p => p.id !== productId))
  }

  function updateProductRow(productId: string, rowId: string, patch: Partial<Row>) {
    setProducts(ps => ps.map(p => (
      p.id === productId ? { ...p, rows: p.rows.map(r => (r.id === rowId ? { ...r, ...patch } : r)) } : p
    )))
  }

  function addProductRow(productId: string) {
    setProducts(ps => ps.map(p => (p.id === productId ? { ...p, rows: [...p.rows, emptyRow()] } : p)))
  }

  function removeProductRow(productId: string, rowId: string) {
    setProducts(ps => ps.map(p => (p.id === productId ? { ...p, rows: p.rows.filter(r => r.id !== rowId) } : p)))
  }

  function showToast(msg: string) {
    setToast(msg)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 4000)
  }

  function handleSave() {
    const valid = [...looseRows, ...products.flatMap(p => p.rows)].filter(rowComplete)
    showToast(
      quoteRef.trim()
        ? `Demo: sẽ tạo ${valid.length} dòng Quote Product cho ${quoteRef.trim()} (${products.length} thành phẩm) (chưa kết nối CRM thật).`
        : 'Nhập mã Quote/WO trước khi lưu.'
    )
  }

  const allRows = [...looseRows, ...products.flatMap(p => p.rows)]
  const totalCount = allRows.length
  const validCount = allRows.filter(rowComplete).length

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

      {/* 1 bang duy nhat — cac nhom truoc, vat tu roi (khong thuoc nhom nao) nam cuoi cung, giong
          dung thu tu file BOQ Excel goc ("Phu kien lap dat" khong nhom luon o cuoi) */}
      <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 16 }}>
        <div className="table-wrap">
          <table className="leaderboard material-entry__table">
            <thead>
              <tr>
                <th style={{ width: 110 }}>Item Code</th>
                <th>Mô tả vật tư</th>
                <th style={{ width: 70 }}>ĐVT</th>
                <th style={{ width: 100, textAlign: 'right' }}>Số lượng</th>
                <th>Ghi chú</th>
                <th style={{ width: 60 }}></th>
              </tr>
            </thead>
            <tbody>
              {products.map((product, pi) => (
                <Fragment key={product.id}>
                  <GroupHeaderTr
                    name={product.name}
                    index={pi}
                    onRename={name => updateProduct(product.id, { name })}
                    onAddRow={() => addProductRow(product.id)}
                    onRemove={() => removeProduct(product.id)}
                  />
                  {product.rows.map(row => (
                    <MaterialRowTr
                      key={row.id}
                      row={row}
                      level1Options={level1Options}
                      level2Options={level2Options}
                      onUpdateRow={patch => updateProductRow(product.id, row.id, patch)}
                      onRemoveRow={() => removeProductRow(product.id, row.id)}
                    />
                  ))}
                </Fragment>
              ))}

              {looseRows.map(row => (
                <MaterialRowTr
                  key={row.id}
                  row={row}
                  level1Options={level1Options}
                  level2Options={level2Options}
                  onUpdateRow={patch => updateLooseRow(row.id, patch)}
                  onRemoveRow={() => removeLooseRow(row.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
        <div className="material-entry__footer">
          <span>{totalCount} dòng · {validCount} dòng đã đủ thông tin</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="kpi-settings__save-btn" type="button" onClick={addLooseRow}>+ Thêm vật tư</button>
            <button className="kpi-settings__save-btn" type="button" onClick={addProduct}>+ Tạo nhóm</button>
          </div>
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
