import type { z, ZodTypeAny } from 'zod';
// Node implementation of `zitejs/backend` for the self-hosted server.
export type ZiteErrorCode = 'BAD_REQUEST' | 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'CONFLICT' | 'RATE_LIMITED' | 'INTERNAL_ERROR' | string;

export class ZiteError extends Error {
  code: ZiteErrorCode;
  userFacingMessage?: string;
  constructor(o: { code: ZiteErrorCode; message: string; userFacingMessage?: string } | string, legacy?: ZiteErrorCode) {
    super(typeof o === 'string' ? o : o.message);
    this.code = typeof o === 'string' ? legacy ?? 'INTERNAL_ERROR' : o.code;
    this.userFacingMessage = typeof o === 'string' ? undefined : o.userFacingMessage;
    this.name = 'ZiteError';
  }
}

export type EndpointContext = { user?: undefined; request: { ip: string; userAgent: string } };
export type EndpointDef = {
  description?: string;
  inputSchema: { safeParse: (v: unknown) => { success: boolean; data?: any } };
  outputSchema?: unknown;
  authenticated?: boolean;
  stream?: boolean;
  execute: (args: { input: any; context: EndpointContext; stream?: unknown }) => Promise<unknown>;
};

export function createEndpoint<I extends ZodTypeAny, O extends ZodTypeAny>(def: {
  description?: string;
  inputSchema: I;
  outputSchema?: O;
  authenticated?: boolean;
  stream?: boolean;
  schedule?: unknown;
  execute: (args: { input: z.infer<I>; context: EndpointContext; stream?: any }) => Promise<unknown>;
}): EndpointDef {
  return def as unknown as EndpointDef;
}

export const STATUS: Record<string, number> = {
  BAD_REQUEST: 400, UNAUTHORIZED: 401, FORBIDDEN: 403, NOT_FOUND: 404, CONFLICT: 409, RATE_LIMITED: 429,
};
