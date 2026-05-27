export type AuthUser = {
  id:         number
  name:       string
  email:      string
  territory:  string | null
  department: string | null
  is_admin:   boolean
}

export async function fetchMe(token: string): Promise<AuthUser> {
  const res = await fetch('/api/auth/me', {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error('Unauthorized')
  const json: { data: AuthUser } = await res.json()
  return json.data
}
