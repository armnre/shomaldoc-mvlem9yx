import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { requireAuth } from '../lib/server';

export default createEndpoint({
  description: 'Admin: searchable, paginated audit log',
  inputSchema: z.object({ token: z.string(), search: z.string().optional(), page: z.number().int().min(1).optional() }),
  outputSchema: z.object({
    rows: z.array(z.object({
      id: z.string(), action: z.string(), actorName: z.string(), role: z.string(), from: z.string(), to: z.string(),
      comment: z.string(), thesisCode: z.string(), at: z.string(),
    })),
    total: z.number(),
    pageSize: z.number(),
  }),
  execute: async ({ input }) => {
    await requireAuth(input.token, ['admin']);
    const pageSize = 30;
    const page = input.page ?? 1;
    const base = `FROM "AuditLogs" a
      LEFT JOIN "Profiles" p ON p.id::text = a."actorId"
      LEFT JOIN "AuditLogsTheses" l ON l."auditLogsId" = a.id
      LEFT JOIN "Theses" t ON t.id = l."thesesId"
      WHERE ($1 = '' OR a."action" ILIKE '%'||$1||'%' OR a."comment" ILIKE '%'||$1||'%' OR p."fullName" ILIKE '%'||$1||'%'
        OR p."username" ILIKE '%'||$1||'%' OR t."thesisCode" ILIKE '%'||$1||'%')`;
    const params = [input.search?.trim() ?? ''];
    const [{ rows }, { rows: c }] = await Promise.all([
      zite.sql({
        query: `SELECT a.id, a."action", COALESCE(p."fullName", p."username") AS actor, a."actorRole", a."fromStatus", a."toStatus",
          a."comment", t."thesisCode", a.created_at AS at ${base} ORDER BY a.created_at DESC LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
        params,
      }),
      zite.sql({ query: `SELECT COUNT(*)::int AS c ${base}`, params }),
    ]);
    const s = (v: unknown) => (v == null ? '' : String(v));
    return {
      rows: rows.map((r) => ({
        id: s(r.id), action: s(r.action), actorName: s(r.actor), role: s(r.actorRole), from: s(r.fromStatus),
        to: s(r.toStatus), comment: s(r.comment), thesisCode: s(r.thesisCode), at: s(r.at),
      })),
      total: Number(c[0]?.c ?? 0),
      pageSize,
    };
  },
});
