import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { first, requireAuth } from '../lib/server';

const step = (s: string) => `(t."status" IN ('PROPOSAL_REVIEW','EXTENSION_REQUESTED') AND t."proposalStep"='${s}')`;

export default createEndpoint({
  description: 'Lists thesis case files visible to the signed-in staff member, with search, filter and pagination',
  inputSchema: z.object({
    token: z.string(),
    scope: z.enum(['professor', 'group_manager', 'graduate_office', 'finance', 'admin']),
    search: z.string().optional(),
    status: z.string().optional(),
    inboxOnly: z.boolean().optional(),
    page: z.number().int().min(1).optional(),
  }),
  outputSchema: z.object({
    rows: z.array(z.object({
      id: z.string(), code: z.string(), titleFa: z.string(), status: z.string(), proposalStep: z.string(),
      studentName: z.string(), studentNumber: z.string(), supervisorName: z.string(), departmentName: z.string(), updatedAt: z.string(),
    })),
    total: z.number(),
    pageSize: z.number(),
  }),
  execute: async ({ input }) => {
    const p = await requireAuth(input.token, [input.scope]);
    const pageSize = 20;
    const page = input.page ?? 1;
    const where: string[] = [];
    const params: unknown[] = [];
    const param = (v: unknown) => { params.push(v); return `$${params.length}`; };

    if (input.scope === 'professor') {
      const u = param(p.id);
      where.push(`(t."supervisorId" = ${u} OR t."advisorId" = ${u} OR EXISTS (
        SELECT 1 FROM "SupervisorRequestsTheses" l JOIN "SupervisorRequests" r ON r.id = l."supervisorRequestsId"
        WHERE l."thesesId" = t.id AND r."professorId" = ${u} AND r."requestStatus" = 'pending'))`);
    } else if (input.scope === 'group_manager') {
      const dep = first(p.department);
      if (!dep) return { rows: [], total: 0, pageSize };
      where.push(`dt."departmentsId" = ${param(dep)}`);
    } else if (input.scope === 'finance') {
      where.push(`t."status" IN ('EXTENSION_REQUESTED','SPECIAL_COMMISSION','EXTENSION_REQUIRED')`);
    }
    if (input.status) where.push(`t."status" = ${param(input.status)}`);
    const q = input.search?.trim();
    if (q) {
      const like = param(`%${q}%`);
      const exact = param(q);
      where.push(`(t."titleFa" ILIKE ${like} OR t."thesisCode" ILIKE ${like} OR sp."fullName" ILIKE ${like}
        OR sp."studentNumber" ILIKE ${like} OR sp."nationalCode" = ${exact} OR su."fullName" ILIKE ${like}
        OR EXISTS (SELECT 1 FROM "IranDocRecordsTheses" il JOIN "IranDocRecords" ir ON ir.id = il."iranDocRecordsId" WHERE il."thesesId" = t.id AND ir."trackingCode" ILIKE ${like}))`);
    }
    if (input.inboxOnly) {
      const inbox: Record<string, string> = {
        professor: `(t."status" IN ('WAITING_SUPERVISOR','LITERATURE_SUPERVISOR_REVIEW','FINAL_SUPERVISOR_REVIEW') OR (${step('supervisor')} AND t."supervisorId" = $1))`,
        group_manager: `(t."status" IN ('GROUP_ASSIGNMENT','GROUP_REVIEW','REVIEWER_ASSIGNMENT') OR ${step('group_manager')})`,
        graduate_office: `(t."status" IN ('IRANDOC_REVIEW','SPECIAL_COMMISSION','PLAGIARISM_CHECK','DEFENSE_SCHEDULING','DEFENSE_SCHEDULED') OR ${step('graduate_office')})`,
        finance: step('finance'),
        admin: 'TRUE',
      };
      where.push(inbox[input.scope]);
    }
    const base = `FROM "Theses" t
      LEFT JOIN "Profiles" sp ON sp.id::text = t."studentId"
      LEFT JOIN "Profiles" su ON su.id::text = t."supervisorId"
      LEFT JOIN "DepartmentsTheses" dt ON dt."thesesId" = t.id
      LEFT JOIN "Departments" d ON d.id = dt."departmentsId"
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}`;
    const [{ rows }, { rows: cnt }] = await Promise.all([
      zite.sql({
        query: `SELECT t.id, t."thesisCode", t."titleFa", t."status", t."proposalStep", sp."fullName" AS sn,
          sp."studentNumber" AS snum, su."fullName" AS sup, d."name" AS dep, t.updated_at AS upd
          ${base} ORDER BY t.updated_at DESC LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
        params,
      }),
      zite.sql({ query: `SELECT COUNT(*)::int AS c ${base}`, params }),
    ]);
    const s = (v: unknown) => (v == null ? '' : String(v));
    return {
      rows: rows.map((r) => ({
        id: s(r.id), code: s(r.thesisCode), titleFa: s(r.titleFa), status: s(r.status), proposalStep: s(r.proposalStep),
        studentName: s(r.sn), studentNumber: s(r.snum), supervisorName: s(r.sup), departmentName: s(r.dep), updatedAt: s(r.upd),
      })),
      total: Number(cnt[0]?.c ?? 0),
      pageSize,
    };
  },
});
