export function getRedirectLocation(response: Response): string | undefined {
  const location = response.headers.get('location')
  return location === null || location.trim().length === 0 ? undefined : location
}

export function isRedirectStatus(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308
}

export function shouldConvertRedirectToGet(status: number, method: string): boolean {
  return (status === 303 && method !== 'GET' && method !== 'HEAD')
    || ((status === 301 || status === 302) && method === 'POST')
}

export function stripBodyHeaders(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(headers).filter(([name]) => {
    const normalizedName = name.toLowerCase()
    return normalizedName !== 'content-length' && normalizedName !== 'content-type'
  }))
}
