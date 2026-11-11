export async function api(path: string, body?: unknown, method?: string) {
  const res = await fetch(path, { method: method || (body === undefined ? 'GET' : 'POST'), headers: body === undefined ? undefined : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const result = await res.json();
  if (!res.ok) {
    if (res.status === 401 && !path.includes('/session')) window.location.href = '/login';
    throw new Error(result?.error || 'Please sign in again.');
  }
  return result;
}
