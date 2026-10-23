// Browser replacement for `zitejs/caller`: each endpoint is POST /api/<name> with a JSON body.
export function createCaller<I, O>(name: string) {
  return async (input?: I): Promise<O> => {
    const res = await fetch(`/api/${name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input ?? {}),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      const err = new Error(body?.userFacingMessage ?? body?.message ?? `API call failed (${res.status})`) as Error & Record<string, unknown>;
      Object.assign(err, { code: body?.code, status: res.status, userFacingMessage: body?.userFacingMessage });
      throw err;
    }
    return body as O;
  };
}
