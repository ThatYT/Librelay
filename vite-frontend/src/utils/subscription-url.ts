/** Native apps use their selected panel; web clients use the panel's public origin. */
export function subscriptionUrl(kind: 'sub' | 'clash', token: string, apiBase: string): string {
  const url = new URL(`open_api/${kind}`, apiBase.endsWith('/') ? apiBase : `${apiBase}/`);
  url.searchParams.set('token', token);
  return url.toString();
}
