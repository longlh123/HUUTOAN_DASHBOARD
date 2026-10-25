export type ItemRow = {
  item_number:              string
  name:                      string
  type:                      string | null
  unit:                      string | null
  sales_price:               number
  unit_cost:                 number
  lifecycle_state:           string | null
  category:                  string | null
  product_group_id:          string | null
  product_group_name:        string | null
  procurement_category:      string | null
  sales_category:            string | null
  last_sale_date:            string | null
  sale_count_3y:              number
  has_ever_sold:              boolean
  sale_count_all_time:        number
  last_sale_date_all_time:   string | null
  last_inventory_txn_date:   string | null
  last_inventory_txn_date_all_time: string | null
  on_hand_qty:                number
  candidate_to_close:         boolean
  signals_synced_at:          string | null
}

export type ItemListMeta = { total: number; current_page: number; last_page: number }

export type ProductGroup = { id: string; name: string | null }

export type ItemLevelOption = { code: number; label: string }

export type ItemStats = {
  cutoff_date: string
  years: number
  by_type: {
    finished:      { total: number; active_3y: number }
    semi_finished: { total: number; active_3y: number }
  }
  semi_finished_dormant:      { count: number; stock_count: number; stock_value: number }
  finished_unsold_with_stock: { count: number; stock_value: number }
  material_unused_with_stock: { count: number; stock_value: number }
}

const BASE = '/api/dashboard/items'

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

export async function fetchItems(params: {
  q?: string; page?: number; per_page?: number; candidate_only?: boolean
  category?: string; product_group?: string; lifecycle_state?: string; exclude_never_sold?: boolean
  finished_unsold_only?: boolean; material_unused_only?: boolean
}): Promise<{ data: ItemRow[]; meta: ItemListMeta }> {
  const qs = new URLSearchParams()
  if (params.q)              qs.set('q', params.q)
  if (params.page)           qs.set('page', String(params.page))
  if (params.per_page)       qs.set('per_page', String(params.per_page))
  if (params.candidate_only) qs.set('candidate_only', '1')
  if (params.category)       qs.set('category', params.category)
  if (params.product_group)  qs.set('product_group', params.product_group)
  if (params.lifecycle_state) qs.set('lifecycle_state', params.lifecycle_state)
  if (params.exclude_never_sold) qs.set('exclude_never_sold', '1')
  if (params.finished_unsold_only) qs.set('finished_unsold_only', '1')
  if (params.material_unused_only) qs.set('material_unused_only', '1')

  const res = await fetch(`${BASE}?${qs}`, { headers: authHeaders() })
  handle401(res)
  if (!res.ok) throw new Error(`Lỗi API (${res.status})`)
  return await res.json()
}

export async function fetchItemCategories(): Promise<string[]> {
  const res = await fetch(`${BASE}/categories`, { headers: authHeaders() })
  handle401(res)
  if (!res.ok) throw new Error(`Lỗi API (${res.status})`)
  const json: { data: string[] } = await res.json()
  return json.data
}

export async function fetchProductGroups(): Promise<ProductGroup[]> {
  const res = await fetch(`${BASE}/product-groups`, { headers: authHeaders() })
  handle401(res)
  if (!res.ok) throw new Error(`Lỗi API (${res.status})`)
  const json: { data: ProductGroup[] } = await res.json()
  return json.data
}

export async function fetchLifecycleStates(): Promise<string[]> {
  const res = await fetch(`${BASE}/lifecycle-states`, { headers: authHeaders() })
  handle401(res)
  if (!res.ok) throw new Error(`Lỗi API (${res.status})`)
  const json: { data: string[] } = await res.json()
  return json.data
}

export async function fetchItemStats(): Promise<ItemStats> {
  const res = await fetch(`${BASE}/stats`, { headers: authHeaders() })
  handle401(res)
  if (!res.ok) throw new Error(`Lỗi API (${res.status})`)
  const json: { data: ItemStats } = await res.json()
  return json.data
}

export async function fetchItemLevel1Options(): Promise<ItemLevelOption[]> {
  const res = await fetch(`${BASE}/level1-options`, { headers: authHeaders() })
  handle401(res)
  if (!res.ok) throw new Error(`Lỗi API (${res.status})`)
  const json: { data: ItemLevelOption[] } = await res.json()
  return json.data
}

export async function fetchItemLevel2Options(): Promise<ItemLevelOption[]> {
  const res = await fetch(`${BASE}/level2-options`, { headers: authHeaders() })
  handle401(res)
  if (!res.ok) throw new Error(`Lỗi API (${res.status})`)
  const json: { data: ItemLevelOption[] } = await res.json()
  return json.data
}
