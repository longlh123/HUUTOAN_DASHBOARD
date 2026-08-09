import { useEffect, useRef, useState } from 'react'
import type { Invoice, InvoiceImportResult } from '../api/invoices'
import { fetchInvoices, importInvoices, updateInvoiceNote } from '../api/invoices'
import { fmtVNDFull } from '../utils/format'

const PAGE_SIZE = 20

function fmtDate(s: string | null): string {
  if (!s) return '—'
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return '—'
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`
}

export function InvoicesPage() {
  const [rows,     setRows]     = useState<Invoice[]>([])
  const [total,    setTotal]    = useState(0)
  const [lastPage, setLastPage] = useState(1)
  const [page,     setPage]     = useState(1)
  const [from,     setFrom]     = useState('')
  const [to,       setTo]       = useState('')
  const [search,   setSearch]   = useState('')
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState<string | null>(null)

  const [importing,    setImporting]    = useState(false)
  const [importResult, setImportResult] = useState<InvoiceImportResult | null>(null)

  const folderInputRef = useRef<HTMLInputElement>(null)

  // webkitdirectory khong co trong type cua React <input>, phai set thu cong qua ref
  useEffect(() => {
    folderInputRef.current?.setAttribute('webkitdirectory', 'true')
    folderInputRef.current?.setAttribute('directory', 'true')
  }, [])

  function loadInvoices(pageOverride?: number) {
    const p = pageOverride ?? page
    setLoading(true)
    setError(null)
    return fetchInvoices({ from: from || undefined, to: to || undefined, search: search || undefined, page: p, per_page: PAGE_SIZE })
      .then(res => {
        setRows(res.data)
        setTotal(res.meta.total)
        setLastPage(res.meta.last_page)
      })
      .catch(e => setError((e as Error).message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadInvoices()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, from, to, search])

  function resetPage() { setPage(1) }

  async function handleFolderSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []).filter(f => f.name.toLowerCase().endsWith('.zip'))
    e.target.value = '' // cho phep chon lai cung folder lan sau van bat duoc onChange
    if (files.length === 0) return

    setImporting(true)
    setImportResult(null)
    try {
      const result = await importInvoices(files)
      setImportResult(result)
      setPage(1) // ve trang 1 de thay hoa don vua import (dang sort theo ngay lap moi nhat)
      await loadInvoices(1) // goi truc tiep — neu dang o san trang 1 thi setPage(1) khong trigger effect
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setImporting(false)
    }
  }

  async function saveNote(id: number, note: string) {
    setRows(prev => prev.map(r => r.id === id ? { ...r, note } : r))
    try {
      await updateInvoiceNote(id, note)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <div className="dashboard">
      <div className="dashboard__header" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <h1 className="dashboard__title">Bảng kê hóa đơn</h1>
          <div>
            <input
              ref={folderInputRef}
              type="file"
              multiple
              style={{ display: 'none' }}
              onChange={handleFolderSelect}
            />
            <button
              className="kpi-settings__save-btn"
              onClick={() => folderInputRef.current?.click()}
              disabled={importing}
            >
              {importing ? 'Đang import...' : 'Import từ folder'}
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <input type="date" className="kpi-settings__input" value={from} onChange={e => { setFrom(e.target.value); resetPage() }} />
          <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>đến</span>
          <input type="date" className="kpi-settings__input" value={to} onChange={e => { setTo(e.target.value); resetPage() }} />
          <input
            type="search"
            className="kpi-settings__input"
            placeholder="Tìm số HĐ, tên/MST bên bán..."
            value={search}
            onChange={e => { setSearch(e.target.value); resetPage() }}
            style={{ width: 260, textAlign: 'left' }}
          />
        </div>
      </div>

      {error && <div className="dashboard__error">{error}</div>}

      {importResult && (
        <div className="card" style={{ marginBottom: '1rem', padding: '12px 16px', fontSize: 13 }}>
          <p style={{ margin: 0 }}>
            Đã import <strong>{importResult.imported}</strong> hóa đơn mới, <strong>{importResult.duplicate}</strong> trùng (bỏ qua)
            {importResult.errors.length > 0 && (
              <> , <strong style={{ color: '#dc2626' }}>{importResult.errors.length}</strong> lỗi</>
            )}
          </p>
          {importResult.errors.length > 0 && (
            <ul style={{ margin: '6px 0 0', paddingLeft: 20, color: '#dc2626' }}>
              {importResult.errors.map((msg, i) => <li key={i}>{msg}</li>)}
            </ul>
          )}
        </div>
      )}

      <div className="card">
        {loading ? (
          <p className="table-placeholder">Đang tải...</p>
        ) : rows.length === 0 ? (
          <p className="table-placeholder">Chưa có hóa đơn nào.</p>
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table className="leaderboard">
                <thead>
                  <tr>
                    <th>TT</th>
                    <th>Loại tài liệu</th>
                    <th>Tài liệu số</th>
                    <th>Ngày lập</th>
                    <th>Ngày ký</th>
                    <th>Đơn vị lập</th>
                    <th>MST</th>
                    <th>Ký hiệu</th>
                    <th>Nội dung</th>
                    <th>Ghi chú</th>
                    <th style={{ textAlign: 'right' }}>Số tiền trên hóa đơn</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r.id}>
                      <td className="leaderboard__rank">{(page - 1) * PAGE_SIZE + i + 1}</td>
                      <td>Hóa đơn</td>
                      <td>{r.invoice_number}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(r.issue_date)}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(r.signed_date)}</td>
                      <td className="leaderboard__name">{r.seller_name || '—'}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>{r.seller_tax_code || '—'}</td>
                      <td>{r.invoice_symbol || '—'}</td>
                      <td style={{ minWidth: 220 }}>{r.content_summary || '—'}</td>
                      <td style={{ minWidth: 160 }}>
                        <input
                          type="text"
                          defaultValue={r.note ?? ''}
                          onBlur={e => {
                            if (e.target.value === (r.note ?? '')) return
                            saveNote(r.id, e.target.value)
                          }}
                          style={{
                            width: '100%', padding: '4px 6px', fontSize: 12,
                            border: '1px solid var(--border)', borderRadius: 4,
                            background: 'var(--bg)', color: 'var(--text)',
                          }}
                        />
                      </td>
                      <td className="leaderboard__value">{r.total_payment != null ? fmtVNDFull(r.total_payment) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {lastPage > 1 && (
              <div className="leaderboard__pagination">
                <button className="leaderboard__page-btn" disabled={page === 1} onClick={() => setPage(p => p - 1)}>←</button>
                <span className="leaderboard__page-info">{page} / {lastPage} ({total} hóa đơn)</span>
                <button className="leaderboard__page-btn" disabled={page === lastPage} onClick={() => setPage(p => p + 1)}>→</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
