import { sessionFetch as fetch } from './session';
import { invalidateAllQueries } from './queryClient';

export async function hashPassword(password: string): Promise<string> {
  if (!password) return '';
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  } catch (e) {
    return password;
  }
}

export async function safeJson(res: Response): Promise<any> {
  try {
    const text = await res.text();
    if (!text || text.trim() === '') return {};
    return JSON.parse(text);
  } catch (e) {
    return {};
  }
}

export async function apiFetch(url: string, options: RequestInit = {}): Promise<any> {


  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  try {
    const res = await fetch(url, {
      ...options,
      headers
    });

    if (!res.ok) {
      if (res.status === 401) {
        return [];
      }
      const errData = await safeJson(res);
      throw new Error(errData.error || `HTTP error ${res.status}`);
    }

    const data = await safeJson(res);

    // Invalidate query caches when data is changed through the Express API
    const method = (options.method || 'GET').toUpperCase();
    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
      invalidateAllQueries();
    }

    return data;
  } catch (err) {
    console.warn("API fetch warning:", err);
    throw err;
  }
}
