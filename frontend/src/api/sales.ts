export type SalesSummary = {
  total_value: number
  total_deals: number
  avg_deal_size: number
  lost_deals: number
  win_rate: number
}

export type PeriodData = {
  period: string
  value: number
  deals: number
}

export type RepData = {
  owner_id: string
  name: string
  team: string
  total_value: number
  deals: number
  lost_deals: number
  win_rate: number
  avg_deal_size: number
  avg_days_to_close: number | null
  kpi: number | null
}

export type TeamData = {
  team_id: string
  name: string
  department_id: string
  department: string
  total_value: number
  deals: number
  lost_deals: number
  win_rate: number
  avg_deal_size: number
  avg_days_to_close: number | null
  members: number
  kpi: number | null
}

export type StageData = {
  stage: string
  count: number
  value: number
}

export type AgingOpp = {
  name: string
  owner: string
  days_open: number
  value: number
  stage: string
}

export type GapToTargetItem = {
  quarter: string
  target:  number
  actual:  number
  gap:     number
}

export type PipelineData = {
  pipeline_value: number
  opportunity_count: number
  weighted_pipeline: number
  by_stage: StageData[]
  forecast_30d: number
  forecast_60d: number
  forecast_90d: number
  aging: AgingOpp[]
}

export type KpiTarget = {
  id:          string
  crm_user_id: string
  user_name:   string
  year:        number
  q1:          number | null
  q2:          number | null
  q3:          number | null
  q4:          number | null
}

export type CrmUser = {
  id:         string
  name:       string
  territory:  string
  department: string
  team:       string
}

export type UserDetail = {
  id:               string
  full_name:        string
  title:            string
  email:            string
  mobile:           string
  is_disabled:      boolean
  azure_state:      number
  business_unit:    string
  business_unit_id: string | null
  department:       string
  department_id:    string | null
  cost_center:      string
  cost_center_id:   string | null
  territory:        string
  territory_id:     string | null
}

export type KpiQuarterPerf = {
  target:    number
  effective: number
  actual:    number
  rollover:  number
}

export type KpiPerformance = {
  user_id:  string
  name:     string
  quarters: { q1: KpiQuarterPerf; q2: KpiQuarterPerf; q3: KpiQuarterPerf; q4: KpiQuarterPerf }
}

export type KpiQuarterly = { q1: number; q2: number; q3: number; q4: number }

export type SalesAll = {
  summary:   SalesSummary
  by_period: PeriodData[]
  by_rep:    RepData[]
  by_team:   TeamData[]
  kpi:       KpiQuarterly
}

export type OppQualityRow = {
  owner_id:          string
  name:              string
  total_open:        number
  with_quote:        number
  quote_attach_rate: number
  avg_days_to_quote: number | null
  complete_rate:     number
  no_activity_30d:   number
  backdated:         number
}

export type TopAccountItem = {
  account_id:  string
  name:        string
  total_value: number
  deals:       number
}

export type WeeklyDealItem = {
  day:   string   // "T2" | "T3" | "T4" | "T5" | "T6" | "T7" | "CN"
  date:  string   // "2026-05-25"
  count: number
  value: number
}

export type DateRange = { from: string; to: string }
export type GroupBy   = 'day' | 'week' | 'month' | 'quarter'

const BASE     = '/api/dashboard/sales'
const OPP_BASE = '/api/dashboard/opportunities'

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

async function apiFetch<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: authHeaders() })
  handle401(res)
  if (!res.ok) {
    let msg = `Lỗi kết nối API (${res.status})`
    try { const j = await res.json(); if (j?.message) msg = j.message } catch { /* ignore */ }
    throw new Error(msg)
  }
  const json: { data: T } = await res.json()
  return json.data
}

async function apiPost<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body:    JSON.stringify(body),
  })
  handle401(res)
  if (!res.ok) throw new Error(`Lỗi API (${res.status})`)
  const json: { data: T } = await res.json()
  return json.data
}

async function apiPut<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method:  'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body:    JSON.stringify(body),
  })
  handle401(res)
  if (!res.ok) throw new Error(`Lỗi API (${res.status})`)
  const json: { data: T } = await res.json()
  return json.data
}

async function apiDelete(url: string): Promise<void> {
  const res = await fetch(url, { method: 'DELETE', headers: authHeaders() })
  handle401(res)
  if (!res.ok) throw new Error(`Lỗi API (${res.status})`)
}

function qs(range: DateRange, extra: Record<string, string> = {}): string {
  return new URLSearchParams({ from: range.from, to: range.to, ...extra }).toString()
}

export const fetchTopAccounts = (range: DateRange, territory: string, department?: string) =>
  apiFetch<TopAccountItem[]>(`${BASE}/top-accounts?${qs(range, { territory, ...(department ? { department } : {}) })}`)

export const fetchWeeklyDeals = (territory: string, weekOffset: number, department?: string) =>
  apiFetch<WeeklyDealItem[]>(`${BASE}/weekly?${new URLSearchParams({ territory, week_offset: String(weekOffset), ...(department ? { department } : {}) })}`)

export const fetchAllSales = (range: DateRange, groupBy: GroupBy, territory: string, department?: string) =>
  apiFetch<SalesAll>(`${BASE}/all?${qs(range, { group_by: groupBy, territory, ...(department ? { department } : {}) })}`)

export const fetchSummary  = (range: DateRange, territory: string, department?: string) =>
  apiFetch<SalesSummary>(`${BASE}/summary?${qs(range, { territory, ...(department ? { department } : {}) })}`)

export const fetchByPeriod = (range: DateRange, groupBy: GroupBy, territory: string, department?: string) =>
  apiFetch<PeriodData[]>(`${BASE}/by-period?${qs(range, { group_by: groupBy, territory, ...(department ? { department } : {}) })}`)

export const fetchByRep    = (range: DateRange, territory: string, department?: string) =>
  apiFetch<RepData[]>(`${BASE}/by-rep?${qs(range, { territory, ...(department ? { department } : {}) })}`)

export const fetchByTeam   = (range: DateRange, territory: string, department?: string) =>
  apiFetch<TeamData[]>(`${BASE}/by-team?${qs(range, { territory, ...(department ? { department } : {}) })}`)

export const fetchPipeline = (territory: string, department?: string) =>
  apiFetch<PipelineData>(`${OPP_BASE}/pipeline?${new URLSearchParams({ territory, ...(department ? { department } : {}) })}`)

export const fetchGapToTarget = (year: number, territory: string, department?: string) =>
  apiFetch<GapToTargetItem[]>(`${BASE}/gap-to-target?${new URLSearchParams({ year: String(year), territory, ...(department ? { department } : {}) })}`)

export const fetchOppQuality = (territory: string, department?: string) =>
  apiFetch<OppQualityRow[]>(`${OPP_BASE}/quality?${new URLSearchParams({ territory, ...(department ? { department } : {}) })}`)

export const fetchKpiQuarterly = (year: number, territory: string, department?: string) =>
  apiFetch<KpiQuarterly>(`${BASE}/kpi-quarterly?${new URLSearchParams({ year: String(year), territory, ...(department ? { department } : {}) })}`)

export const fetchCrmUsers = () =>
  apiFetch<CrmUser[]>('/api/dashboard/sales/users')

export const fetchUserList = () =>
  apiFetch<UserDetail[]>('/api/dashboard/users')

export const updateUser = (id: string, payload: {
  business_unit_id?: string | null
  department_id?:    string | null
  territory_id?:     string | null
  cost_center_id?:   string | null
  is_disabled?:      boolean
}) => apiPut<{ id: string }>(`/api/dashboard/users/${id}`, payload)

export const fetchKpiTargets     = (year: number) =>
  apiFetch<KpiTarget[]>(`/api/dashboard/kpi?year=${year}`)

export const fetchKpiPerformance = (year: number) =>
  apiFetch<KpiPerformance[]>(`/api/dashboard/kpi/performance?year=${year}`)

export const createKpiTarget = (payload: Omit<KpiTarget, 'id'>) =>
  apiPost<KpiTarget>('/api/dashboard/kpi', payload)

export const updateKpiTarget = (id: string, payload: Pick<KpiTarget, 'q1' | 'q2' | 'q3' | 'q4'> & { year: number }) =>
  apiPut<KpiTarget>(`/api/dashboard/kpi/${id}`, payload)

export const deleteKpiTarget = (id: string, year: number) =>
  apiDelete(`/api/dashboard/kpi/${id}?year=${year}`)
