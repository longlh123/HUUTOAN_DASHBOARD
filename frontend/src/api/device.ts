import type { DateRange } from './sales'

export type DeviceProductLineItem = {
  name:  string
  count: number
  pct:   number
}

export type DeviceProductLineData = {
  total: number
  items: DeviceProductLineItem[]
}

export type AgreementKpis = {
  active_count:     number
  never_maintained: number
  expiring_soon:    number
  expired_count:    number
  total_value:      number
}

export type AgreementByType = {
  type:    string
  Active:  number
  Expired: number
  Draft:   number
  Lost:    number
}

export type AlertRecord = {
  id:           string
  code:         string
  type:         string
  device:       string
  customer:     string
  owner:        string
  team:         string
  total_times:  number
  actual_times: number
  remaining:    number
  created_at:   string
}

export type AgreementOverview = {
  kpis:    AgreementKpis
  by_type: AgreementByType[]
  alerts:  {
    never_maintained: AlertRecord[]
    drafts:           AlertRecord[]
  }
}

export type MaintenanceScheduleKpis = {
  total:       number
  unscheduled: number
  scheduled:   number
  in_progress: number
  completed:   number
}

export type MaintenanceScheduleItem = {
  id:            string
  code:          string
  type:          string
  status_code:   number
  status:        string
  customer:      string
  region:        string
  city:          string
  address:       string
  service_unit:  string
  planned_date:  string
  engineer:      string
  has_agreement: boolean
}

export type MaintenanceScheduleData = {
  kpis:  MaintenanceScheduleKpis
  items: MaintenanceScheduleItem[]
}

export type AgreementItem = {
  id:           string
  code:         string
  type:         string
  status:       string
  device:       string
  customer:     string
  owner:        string
  team:         string
  total_times:  number
  actual_times: number
  remaining:    number
  progress_pct: number
  value:        number
  created_at:   string
}

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

const BASE = '/api/dashboard/devices'

function qs(range: DateRange): string {
  return new URLSearchParams({ from: range.from, to: range.to }).toString()
}

export const fetchDeviceByProductLine = (range: DateRange) =>
  apiFetch<DeviceProductLineData>(`${BASE}/by-product-line?${qs(range)}`)

export const fetchAgreementOverview = () =>
  apiFetch<AgreementOverview>(`${BASE}/agreement-overview`)

export const fetchAgreements = (type?: string, status?: string) => {
  const params = new URLSearchParams()
  if (type)   params.set('type', type)
  if (status) params.set('status', status)
  return apiFetch<AgreementItem[]>(`${BASE}/agreements?${params}`)
}

export const fetchMaintenanceSchedule = (year: number, quarter: number) =>
  apiFetch<MaintenanceScheduleData>(`${BASE}/maintenance-schedule?year=${year}&quarter=${quarter}`)

export type ServiceCenter = {
  id:         string
  name:       string
  address:    string | null
  latitude:   number | null
  longitude:  number | null
  maps_url:   string | null
  dispatcher: string | null
  site:       string | null
  is_active:  boolean
}

export const fetchServiceCenters = () =>
  apiFetch<ServiceCenter[]>(`${BASE}/service-centers`)

export type InventoryStockItem = {
  item_number: string,
  name: string,
  stock_qty: number
}

export const fetchInventoryStockList = () => 
  apiFetch<InventoryStockItem[]>(`${BASE}/inventory-stock-list`)

export type WorkOrderPart = {
  item_number:  string | null
  name:         string
  qty_needed:   number
  stock_qty:    number | null
  shortage:     number | null
  is_write_in:  boolean
  sufficient:   boolean | null
}

export type WorkOrderPartsData = {
  all:      WorkOrderPart[]
  shortage: WorkOrderPart[]
}

export const fetchWorkOrderParts = (workOrderId: string) =>
  apiFetch<WorkOrderPartsData>(`${BASE}/work-orders/${workOrderId}/parts`)

export type WorkOrderPartsSummaryRow = WorkOrderPartsData & {
  id:           string
  code:         string
  type:         string
  engineer:     string
  planned_date: string
}

export const fetchWorkOrdersPartsSummary = (from: string, to: string) =>
  apiFetch<WorkOrderPartsSummaryRow[]>(`${BASE}/work-orders/parts-summary?from=${from}&to=${to}`)