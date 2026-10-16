import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReferenceField, ReferenceOption, ReferenceRow, ReferenceSchema, ReferenceTable } from '../api/sales'
import {
  createReferenceRow,
  fetchReferenceOptions,
  fetchReferenceRows,
  fetchReferenceSchema,
  fetchReferenceTables,
  updateReferenceRow,
} from '../api/sales'

export function ReferenceDataPage() {
  const [tables,  setTables]  = useState<ReferenceTable[]>([])
  const [current, setCurrent] = useState<string>('')

  const [schema,  setSchema]  = useState<ReferenceSchema | null>(null)
  const [rows,    setRows]    = useState<ReferenceRow[]>([])
  const [options, setOptions] = useState<Record<string, ReferenceOption[]>>({})
  const [schemasByTable, setSchemasByTable] = useState<Record<string, ReferenceSchema>>({})

  const [importTarget, setImportTarget] = useState<{ childTable: string; field: ReferenceField; parentRow: ReferenceRow } | null>(null)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)
  const [search,  setSearch]  = useState('')
  const [pageSize, setPageSize] = useState(20)
  const [page,     setPage]     = useState(1)

  const [editRow,  setEditRow]  = useState<ReferenceRow | 'new' | null>(null)
  const [editForm, setEditForm] = useState<Record<string, string>>({})
  const [saving,   setSaving]   = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    fetchReferenceTables()
      .then(async list => {
        setTables(list)
        setCurrent(list[0]?.key ?? '')
        const schemas = await Promise.all(list.map(t => fetchReferenceSchema(t.key)))
        setSchemasByTable(Object.fromEntries(schemas.map(s => [s.key, s])))
      })
      .catch(e => setError((e as Error).message))
  }, [])

  useEffect(() => {
    if (!current) return
    let cancelled = false
    setLoading(true)
    setError(null)

    Promise.all([fetchReferenceSchema(current), fetchReferenceRows(current)])
      .then(async ([s, r]) => {
        if (cancelled) return
        setSchema(s)
        setRows(r)

        const lookupFields = s.fields.filter(f => (f.type === 'lookup' || f.type === 'text_select') && f.lookup_table)
        const opts: Record<string, ReferenceOption[]> = {}
        await Promise.all(lookupFields.map(async f => {
          opts[f.lookup_table as string] = await fetchReferenceOptions(f.lookup_table as string)
        }))
        if (!cancelled) setOptions(opts)
      })
      .catch(e => { if (!cancelled) setError((e as Error).message) })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [current])

  const filteredRows = useMemo(() => {
    if (!search) return rows
    const q = search.toLowerCase()
    return rows.filter(r => Object.values(r).some(v => String(v ?? '').toLowerCase().includes(q)))
  }, [rows, search])

  const childRelations = useMemo(() => {
    const result: { table: string; field: ReferenceField }[] = []
    Object.entries(schemasByTable).forEach(([key, s]) => {
      s.fields.forEach(f => {
        if (f.type === 'lookup' && f.lookup_table === current) {
          result.push({ table: key, field: f })
        }
      })
    })
    return result
  }, [schemasByTable, current])

  const totalPages  = Math.max(1, Math.ceil(filteredRows.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const pagedRows    = filteredRows.slice((currentPage - 1) * pageSize, currentPage * pageSize)

  function selectTable(key: string) {
    setCurrent(key)
    setSearch('')
    setPage(1)
  }

  function setFormValue(key: string, value: string) {
    setEditForm(f => {
      const next = { ...f, [key]: value }
      schema?.fields.forEach(field => {
        if (field.depends_on === key) next[field.key] = ''
      })
      return next
    })
  }

  function openEdit(row: ReferenceRow | 'new') {
    if (!schema) return
    const form: Record<string, string> = {}
    schema.fields.forEach(f => {
      form[f.key] = row === 'new' ? '' : String(row[f.key] ?? '')
    })
    setEditForm(form)
    setEditRow(row)
    setSaveError(null)
  }

  async function handleSave() {
    if (!schema || !editRow) return
    setSaving(true)
    setSaveError(null)
    try {
      if (editRow === 'new') {
        await createReferenceRow(current, editForm)
      } else {
        await updateReferenceRow(current, editRow.id, editForm)
      }
      const fresh = await fetchReferenceRows(current)
      setRows(fresh)
      setEditRow(null)
    } catch (e) {
      setSaveError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  function badgeClass(value: string) {
    return value === 'Active' ? 'win-rate win-rate--high' : 'win-rate win-rate--low'
  }

  function csvCell(field: ReferenceField, row: ReferenceRow): string {
    const value = field.type === 'lookup' || field.type === 'select'
      ? String(row[`${field.key}_label`] ?? '')
      : String(row[field.key] ?? '')

    return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
  }

  function downloadCsv(fields: ReferenceField[], dataRows: ReferenceRow[], filename: string) {
    const headers = ['#', ...fields.map(f => f.label)]
    const lines = [headers.join(',')]

    dataRows.forEach((row, i) => {
      lines.push([String(i + 1), ...fields.map(f => csvCell(f, row))].join(','))
    })

    const blob = new Blob([String.fromCharCode(0xfeff) + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  function exportRawData() {
    if (!schema) return
    downloadCsv(schema.fields, filteredRows, `${schema.key}_${new Date().toISOString().slice(0, 10)}.csv`)
  }

  async function exportChildCsv(childTable: string, field: ReferenceField, parentRow: ReferenceRow) {
    const childSchema = schemasByTable[childTable]
    if (!childSchema) return
    const childRows = await fetchReferenceRows(childTable, { field: field.key, value: parentRow.id })
    const parentLabel = schema ? String(parentRow[schema.fields[0].key] ?? parentRow.id) : parentRow.id
    downloadCsv(childSchema.fields, childRows, `${childTable}_${parentLabel}.csv`)
  }

  function parseCsv(text: string): string[][] {
    const clean = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
    const result: string[][] = []
    let row: string[] = []
    let field = ''
    let inQuotes = false

    for (let i = 0; i < clean.length; i++) {
      const c = clean[i]
      if (inQuotes) {
        if (c === '"') {
          if (clean[i + 1] === '"') { field += '"'; i++ } else { inQuotes = false }
        } else {
          field += c
        }
      } else if (c === '"') {
        inQuotes = true
      } else if (c === ',') {
        row.push(field); field = ''
      } else if (c === '\r') {
        // skip
      } else if (c === '\n') {
        row.push(field); result.push(row); row = []; field = ''
      } else {
        field += c
      }
    }
    if (field.length > 0 || row.length > 0) { row.push(field); result.push(row) }

    return result.filter(r => r.length > 1 || r[0] !== '')
  }

  function parseValueForField(field: ReferenceField, raw: string): string {
    if (field.type === 'select' && field.options) {
      const entry = Object.entries(field.options).find(([, label]) => label === raw)
      return entry ? entry[0] : '0'
    }
    if (field.type === 'lookup') return ''
    return raw
  }

  function triggerImport(childTable: string, field: ReferenceField, parentRow: ReferenceRow) {
    setImportTarget({ childTable, field, parentRow })
    setImportResult(null)
    fileInputRef.current?.click()
  }

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !importTarget) return

    const childSchema = schemasByTable[importTarget.childTable]
    if (!childSchema) return

    setImporting(true)
    const text = await file.text()
    const table = parseCsv(text)
    const [header, ...body] = table
    const fieldByLabel = new Map(childSchema.fields.map(f => [f.label, f]))

    let ok = 0
    let fail = 0
    for (const line of body) {
      if (line.every(c => c === '')) continue
      const payload: Record<string, string> = { [importTarget.field.key]: importTarget.parentRow.id }
      header.forEach((h, idx) => {
        const f = fieldByLabel.get(h)
        if (!f || f.key === importTarget.field.key) return
        payload[f.key] = parseValueForField(f, line[idx] ?? '')
      })
      try {
        await createReferenceRow(importTarget.childTable, payload)
        ok++
      } catch {
        fail++
      }
    }

    setImporting(false)
    setImportResult(`Đã nhập ${ok} dòng${fail ? `, lỗi ${fail} dòng` : ''} vào ${childSchema.label}.`)
    if (current === importTarget.childTable) {
      setRows(await fetchReferenceRows(current))
    }
  }

  function cellContent(field: ReferenceField, row: ReferenceRow) {
    if (field.type === 'lookup') {
      return row[`${field.key}_label`] ?? '—'
    }
    if (field.type === 'select') {
      const label = String(row[`${field.key}_label`] ?? '')
      return field.badge ? <span className={badgeClass(label)}>{label}</span> : label
    }
    return row[field.key] ?? '—'
  }

  function fieldInput(field: ReferenceField) {
    const value = editForm[field.key] ?? ''

    if (field.type === 'select' && field.options) {
      return (
        <select
          className="kpi-settings__year-select"
          style={{ width: '100%' }}
          value={value}
          disabled={field.readonly}
          onChange={e => setFormValue(field.key, e.target.value)}
        >
          {Object.entries(field.options).map(([v, label]) => (
            <option key={v} value={v}>{label}</option>
          ))}
        </select>
      )
    }

    if (field.type === 'lookup') {
      const opts = options[field.lookup_table ?? ''] ?? []
      return (
        <select
          className="kpi-settings__year-select"
          style={{ width: '100%' }}
          value={value}
          onChange={e => setFormValue(field.key, e.target.value)}
        >
          <option value="">— Chọn —</option>
          {opts.map(o => (
            <option key={o.id} value={o.id}>{o.label}</option>
          ))}
        </select>
      )
    }

    if (field.type === 'text_select') {
      const opts = options[field.lookup_table ?? ''] ?? []
      const parentValue = field.depends_on ? editForm[field.depends_on] : undefined
      const filtered = field.depends_on
        ? opts.filter(o => o[field.depends_on_match ?? ''] === parentValue)
        : opts
      const disabled = !!field.depends_on && !parentValue

      return (
        <select
          className="kpi-settings__year-select"
          style={{ width: '100%' }}
          value={value}
          disabled={disabled}
          onChange={e => setFormValue(field.key, e.target.value)}
        >
          <option value="">{disabled ? '— Chọn Tỉnh/TP trước —' : '— Chọn —'}</option>
          {filtered.map(o => (
            <option key={o.id} value={o.label}>{o.label}</option>
          ))}
        </select>
      )
    }

    return (
      <input
        className="kpi-settings__input"
        style={{ width: '100%' }}
        value={value}
        readOnly={field.readonly}
        onChange={e => setFormValue(field.key, e.target.value)}
      />
    )
  }

  return (
    <div className="dashboard">
      <div className="dashboard__header" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
        <h1 className="dashboard__title">Reference Data</h1>
        <p style={{ fontSize: 13, color: 'var(--text)', margin: '4px 0 0' }}>
          Quản lý danh mục tham chiếu CRM trực tiếp từ dashboard — thêm bảng mới chỉ cần cấu hình ở backend, không cần build lại trang này.
        </p>
      </div>

      {error && <div className="dashboard__error">{error}</div>}
      {importResult && <p className="table-placeholder">{importResult}</p>}

      <input
        ref={fileInputRef}
        type="file"
        accept=".csv"
        style={{ display: 'none' }}
        onChange={handleFileSelected}
      />

      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 16, alignItems: 'start' }}>
        <div className="card" style={{ padding: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {tables.map(t => (
              <button
                key={t.key}
                className={`date-filter__btn${current === t.key ? ' date-filter__btn--active' : ''}`}
                style={{ width: '100%', textAlign: 'left' }}
                onClick={() => selectTable(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <input
              className="kpi-settings__input"
              type="search"
              placeholder="Tìm..."
              style={{ width: 240 }}
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <select
                className="kpi-settings__year-select"
                style={{ width: 'auto' }}
                value={pageSize}
                onChange={e => { setPageSize(Number(e.target.value)); setPage(1) }}
              >
                {[20, 50, 100].map(n => <option key={n} value={n}>{n} / trang</option>)}
              </select>
              {schema && (
                <>
                  <button className="leaderboard__page-btn" onClick={exportRawData}>Export rawdata</button>
                  <button className="leaderboard__page-btn" onClick={() => openEdit('new')}>+ Thêm dòng</button>
                </>
              )}
            </div>
          </div>

          {loading ? (
            <p className="table-placeholder">Đang tải...</p>
          ) : !schema || filteredRows.length === 0 ? (
            <p className="table-placeholder">Không có dữ liệu.</p>
          ) : (
            <>
              <div className="table-wrap">
                <table className="leaderboard">
                  <thead>
                    <tr>
                      <th>#</th>
                      {schema.fields.map(f => <th key={f.key}>{f.label}</th>)}
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedRows.map((row, i) => (
                      <tr key={row.id}>
                        <td className="leaderboard__rank">{(currentPage - 1) * pageSize + i + 1}</td>
                        {schema.fields.map((f, fi) => (
                          <td key={f.key} className={fi === 0 ? 'leaderboard__name' : ''}>{cellContent(f, row)}</td>
                        ))}
                        <td style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <button className="leaderboard__page-btn" style={{ fontSize: 13, padding: '2px 10px' }} onClick={() => openEdit(row)}>
                            Sửa
                          </button>
                          {childRelations.map(rel => (
                            <span key={rel.table} style={{ display: 'inline-flex', gap: 6 }}>
                              <button
                                className="leaderboard__page-btn"
                                style={{ fontSize: 13, padding: '2px 10px' }}
                                onClick={() => exportChildCsv(rel.table, rel.field, row)}
                              >
                                Export {schemasByTable[rel.table]?.label}
                              </button>
                              <button
                                className="leaderboard__page-btn"
                                style={{ fontSize: 13, padding: '2px 10px' }}
                                disabled={importing}
                                onClick={() => triggerImport(rel.table, rel.field, row)}
                              >
                                Import {schemasByTable[rel.table]?.label}
                              </button>
                            </span>
                          ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 && (
                <div className="leaderboard__pagination">
                  <button
                    className="leaderboard__page-btn"
                    disabled={currentPage === 1}
                    onClick={() => setPage(p => p - 1)}
                  >←</button>
                  <span className="leaderboard__page-info">
                    {currentPage} / {totalPages} ({filteredRows.length} dòng)
                  </span>
                  <button
                    className="leaderboard__page-btn"
                    disabled={currentPage === totalPages}
                    onClick={() => setPage(p => p + 1)}
                  >→</button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {editRow && schema && (
        <div
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={e => { if (e.target === e.currentTarget) setEditRow(null) }}
        >
          <div className="card" style={{ width: 440, maxWidth: '92vw', margin: 0, padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 className="card__title" style={{ margin: 0 }}>
                {editRow === 'new' ? `Thêm — ${schema.label}` : `Sửa — ${schema.label}`}
              </h2>
              <button className="sidebar__close" onClick={() => setEditRow(null)}>✕</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {schema.fields.map(f => (
                <label key={f.key} style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
                  {f.label}
                  {fieldInput(f)}
                </label>
              ))}
            </div>

            {saveError && <div className="dashboard__error" style={{ marginTop: 12 }}>{saveError}</div>}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
              <button className="leaderboard__page-btn" onClick={() => setEditRow(null)}>Hủy</button>
              <button
                className="leaderboard__page-btn"
                style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
                disabled={saving}
                onClick={handleSave}
              >
                {saving ? 'Đang lưu...' : 'Lưu'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
