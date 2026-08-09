export type InvoiceItem = {
  id:         number
  line_no:    number | null
  item_code:  string | null
  item_name:  string | null
  unit:       string | null
  quantity:   number | null
  unit_price: number | null
  amount:     number | null
  tax_rate:   string | null
}

export type Invoice = {
  id:               number
  lookup_code:      string | null
  invoice_number:   string
  invoice_symbol:   string | null
  issue_date:       string | null
  signed_date:      string | null
  seller_name:      string | null
  seller_tax_code:  string | null
  content_summary:  string | null
  note:             string | null
  total_payment:    number | null
  items?:           InvoiceItem[]
}

export type InvoiceListMeta = { total: number; current_page: number; last_page: number }

export type InvoiceImportResult = { imported: number; duplicate: number; errors: string[] }

const BASE = '/api/dashboard/invoices'
const IMPORT_BATCH_SIZE = 10 // tranh vuot gioi han php.ini (max_file_uploads/post_max_size) khi upload nhieu file cung luc

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('ht_token')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

function handle401(res: Response): void {
  if (res.status === 401) {
    localStorage.removeItem('ht_token')
    window.location.href = '/login'
    throw new Error('Unauthorized')
  }
}

export async function fetchInvoices(params: {
  from?: string; to?: string; search?: string; page?: number; per_page?: number
}): Promise<{ data: Invoice[]; meta: InvoiceListMeta }> {
  const qs = new URLSearchParams()
  if (params.from)     qs.set('from', params.from)
  if (params.to)       qs.set('to', params.to)
  if (params.search)   qs.set('search', params.search)
  if (params.page)     qs.set('page', String(params.page))
  if (params.per_page) qs.set('per_page', String(params.per_page))

  const res = await fetch(`${BASE}?${qs}`, { headers: authHeaders() })
  handle401(res)
  if (!res.ok) throw new Error(`Lỗi API (${res.status})`)
  return await res.json()
}

export async function updateInvoiceNote(id: number, note: string): Promise<void> {
  const res = await fetch(`${BASE}/${id}`, {
    method:  'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body:    JSON.stringify({ note }),
  })
  handle401(res)
  if (!res.ok) throw new Error(`Lỗi API (${res.status})`)
}

export async function importInvoices(files: File[]): Promise<InvoiceImportResult> {
  const aggregate: InvoiceImportResult = { imported: 0, duplicate: 0, errors: [] }

  for (let i = 0; i < files.length; i += IMPORT_BATCH_SIZE) {
    const batch = files.slice(i, i + IMPORT_BATCH_SIZE)
    const form  = new FormData()
    batch.forEach(f => form.append('files[]', f))

    const res = await fetch(`${BASE}/import`, {
      method:  'POST',
      headers: authHeaders(),
      body:    form,
    })
    handle401(res)
    if (!res.ok) throw new Error(`Lỗi API (${res.status})`)
    const json: { data: InvoiceImportResult } = await res.json()

    aggregate.imported  += json.data.imported
    aggregate.duplicate += json.data.duplicate
    aggregate.errors.push(...json.data.errors)
  }

  return aggregate
}
