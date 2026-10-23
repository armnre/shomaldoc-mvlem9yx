const KEY = 'shomaldoc-session';

export const getToken = () => sessionStorage.getItem(KEY) ?? localStorage.getItem(KEY) ?? '';
export function setToken(t: string, remember: boolean) {
  (remember ? localStorage : sessionStorage).setItem(KEY, t);
}
export function clearToken() {
  localStorage.removeItem(KEY);
  sessionStorage.removeItem(KEY);
}
