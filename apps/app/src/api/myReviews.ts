import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { requireAuth } from '../lib/server';

export default createEndpoint({
  description: 'Lists theses assigned to the signed-in reviewer with their review status',
  inputSchema: z.object({ token: z.string() }),
  outputSchema: z.object({
    items: z.array(z.object({
      reviewId: z.string(), thesisId: z.string(), code: z.string(), titleFa: z.string(), thesisStatus: z.string(),
      verdict: z.string(), score: z.number().nullable(), round: z.number(), defenseDate: z.string(),
    })),
  }),
  execute: async ({ input }) => {
    const p = await requireAuth(input.token);
    const { rows } = await zite.sql({
      query: `SELECT r.id AS rid, t.id AS tid, t."thesisCode", t."titleFa", t."status", r."verdict", r."score", r."round", t."defenseDate"
        FROM "Reviews" r JOIN "ReviewsTheses" l ON l."reviewsId" = r.id JOIN "Theses" t ON t.id = l."thesesId"
        WHERE r."reviewerId" = $1 ORDER BY (r."verdict" = 'pending') DESC, t.updated_at DESC LIMIT 200`,
      params: [p.id],
    });
    const s = (v: unknown) => (v == null ? '' : String(v));
    return {
      items: rows.map((r) => ({
        reviewId: s(r.rid), thesisId: s(r.tid), code: s(r.thesisCode), titleFa: s(r.titleFa), thesisStatus: s(r.status),
        verdict: s(r.verdict), score: r.score == null ? null : Number(r.score), round: Number(r.round ?? 1), defenseDate: s(r.defenseDate),
      })),
    };
  },
});
