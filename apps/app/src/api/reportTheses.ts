import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { ZitePdf } from 'zitejs/pdf';
import { first, requireAuth, STATUS_FA } from '../lib/server';
import { fromJalali } from '../lib/jalali';
import { LOGO_DATA_URI } from '../lib/logoData';

const filtersSchema = z.object({
  facultyId: z.string().optional(),
  departmentId: z.string().optional(),
  programId: z.string().optional(),
  specialization: z.string().optional(),
  supervisorId: z.string().optional(),
  termId: z.string().optional(),
  jalaliYear: z.number().int().min(1390).max(1500).optional(),
  status: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  q: z.string().optional(),
});

const rowSchema = z.object({
  code: z.string(), title: z.string(), student: z.string(), studentNumber: z.string(), supervisor: z.string(),
  department: z.string(), faculty: z.string(), program: z.string(), specialization: z.string(), status: z.string(),
  statusLabel: z.string(), created: z.string(), defenseScore: z.number().nullable(), similarity: z.number().nullable(), irandocCode: z.string(),
});

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fdate = (v: string) => (v ? new Intl.DateTimeFormat('fa-IR-u-ca-persian', { dateStyle: 'medium', timeZone: 'Asia/Tehran' }).format(new Date(v)) : '—');

export default createEndpoint({
  description: 'Filtered thesis report (faculty, department, program, specialization, supervisor, term, year, status, date range) with PDF export',
  inputSchema: z.object({
    token: z.string(),
    scope: z.enum(['group_manager', 'graduate_office', 'admin']),
    op: z.enum(['options', 'rows', 'pdf']).default('rows'),
    filters: filtersSchema.default({}),
  }),
  outputSchema: z.object({
    options: z.object({
      faculties: z.array(z.object({ id: z.string(), name: z.string() })),
      departments: z.array(z.object({ id: z.string(), name: z.string() })),
      programs: z.array(z.object({ id: z.string(), name: z.string() })),
      specializations: z.array(z.string()),
      supervisors: z.array(z.object({ id: z.string(), name: z.string() })),
      terms: z.array(z.object({ id: z.string(), name: z.string() })),
    }).optional(),
    rows: z.array(rowSchema).optional(),
    total: z.number().optional(),
    pdfUrl: z.string().optional(),
  }),
  execute: async ({ input }) => {
    const p = await requireAuth(input.token, [input.scope]);
    const scopeDep = input.scope === 'group_manager' ? first(p.department) : undefined;

    if (input.op === 'options') {
      const [fac, dep, prog, sup, terms] = await Promise.all([
        zite.sql({ query: `SELECT id, "name" FROM "Faculties" ORDER BY "name"` }),
        zite.sql({ query: `SELECT id, "name" FROM "Departments" ${scopeDep ? 'WHERE id::text = $1' : ''} ORDER BY "name"`, params: scopeDep ? [scopeDep] : [] }),
        zite.sql({ query: `SELECT id, "name", "specialization" FROM "Programs" ORDER BY "name"` }),
        zite.sql({ query: `SELECT DISTINCT pr.id, pr."fullName" FROM "Theses" t JOIN "Profiles" pr ON pr.id::text = t."supervisorId" ORDER BY pr."fullName"` }),
        zite.sql({ query: `SELECT id, "name" FROM "AcademicTerms" ORDER BY "startDate" DESC NULLS LAST` }),
      ]);
      const opt = (rows: Record<string, unknown>[], k = 'name') => rows.map((r) => ({ id: String(r.id), name: String(r[k] ?? '—') }));
      return {
        options: {
          faculties: opt(fac.rows), departments: opt(dep.rows), programs: opt(prog.rows), supervisors: opt(sup.rows, 'fullName'), terms: opt(terms.rows),
          specializations: [...new Set(prog.rows.map((r) => String(r.specialization ?? '')).filter(Boolean))],
        },
      };
    }

    const f = input.filters;
    const params: unknown[] = [];
    const $ = (v: unknown) => { params.push(v); return `$${params.length}`; };
    const where: string[] = [];
    const depId = scopeDep ?? f.departmentId;
    if (depId) where.push(`dt."departmentsId"::text = ${$(depId)}`);
    if (f.facultyId) where.push(`EXISTS (SELECT 1 FROM "DepartmentsFaculties" df WHERE df."departmentsId" = dt."departmentsId" AND df."facultiesId"::text = ${$(f.facultyId)})`);
    if (f.programId) where.push(`pt."programsId"::text = ${$(f.programId)}`);
    if (f.specialization) where.push(`pg."specialization" = ${$(f.specialization)}`);
    if (f.supervisorId) where.push(`t."supervisorId" = ${$(f.supervisorId)}`);
    if (f.status) where.push(`t."status" = ${$(f.status)}`);
    if (f.termId) where.push(`EXISTS (SELECT 1 FROM "AcademicTerms" at WHERE at.id::text = ${$(f.termId)} AND t.created_at::date BETWEEN at."startDate"::date AND at."endDate"::date)`);
    if (f.jalaliYear) {
      where.push(`t.created_at::date >= ${$(iso(fromJalali(f.jalaliYear, 1, 1)))}::date AND t.created_at::date < ${$(iso(fromJalali(f.jalaliYear + 1, 1, 1)))}::date`);
    }
    if (f.dateFrom) where.push(`t.created_at >= ${$(f.dateFrom)}::timestamptz`);
    if (f.dateTo) where.push(`t.created_at <= ${$(f.dateTo)}::timestamptz`);
    if (f.q?.trim()) {
      const like = $(`%${f.q.trim()}%`);
      where.push(`(t."titleFa" ILIKE ${like} OR t."thesisCode" ILIKE ${like} OR sp."fullName" ILIKE ${like} OR sp."studentNumber" ILIKE ${like}
        OR EXISTS (SELECT 1 FROM "IranDocRecordsTheses" il JOIN "IranDocRecords" ir ON ir.id = il."iranDocRecordsId" WHERE il."thesesId" = t.id AND ir."trackingCode" ILIKE ${like}))`);
    }
    const { rows } = await zite.sql({
      query: `SELECT t."thesisCode" AS code, t."titleFa" AS title, t."status", t.created_at AS created, t."defenseScore" AS score, t."similarityPercent" AS sim,
          sp."fullName" AS student, sp."studentNumber" AS snum, su."fullName" AS supervisor, d."name" AS dep, pg."name" AS prog, pg."specialization" AS spec,
          (SELECT fa."name" FROM "DepartmentsFaculties" df JOIN "Faculties" fa ON fa.id = df."facultiesId" WHERE df."departmentsId" = d.id LIMIT 1) AS fac,
          (SELECT ir."trackingCode" FROM "IranDocRecordsTheses" il JOIN "IranDocRecords" ir ON ir.id = il."iranDocRecordsId" WHERE il."thesesId" = t.id AND ir."trackingCode" IS NOT NULL LIMIT 1) AS irandoc
        FROM "Theses" t
        LEFT JOIN "Profiles" sp ON sp.id::text = t."studentId"
        LEFT JOIN "Profiles" su ON su.id::text = t."supervisorId"
        LEFT JOIN "DepartmentsTheses" dt ON dt."thesesId" = t.id
        LEFT JOIN "Departments" d ON d.id = dt."departmentsId"
        LEFT JOIN "ProgramsTheses" pt ON pt."thesesId" = t.id
        LEFT JOIN "Programs" pg ON pg.id = pt."programsId"
        ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
        ORDER BY t.created_at DESC LIMIT 2000`,
      params,
    });
    const s = (v: unknown) => (v == null ? '' : String(v));
    const n = (v: unknown) => (v == null ? null : Number(v));
    const out = rows.map((r) => ({
      code: s(r.code), title: s(r.title), student: s(r.student), studentNumber: s(r.snum), supervisor: s(r.supervisor), department: s(r.dep),
      faculty: s(r.fac), program: s(r.prog), specialization: s(r.spec), status: s(r.status), statusLabel: STATUS_FA[s(r.status)] ?? s(r.status),
      created: s(r.created), defenseScore: n(r.score), similarity: n(r.sim), irandocCode: s(r.irandoc),
    }));
    if (input.op === 'rows') return { rows: out, total: out.length };

    const html = `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><style>
@page { size: A4 landscape; margin: 14mm; }
body { font-family: Vazirmatn, Tahoma, sans-serif; font-size: 9pt; color: #111; }
header { display: flex; align-items: center; gap: 12px; border-bottom: 2px solid #1e3a6e; padding-bottom: 8px; margin-bottom: 10px; }
header img { height: 52px; } h1 { font-size: 13pt; margin: 0; color: #1e3a6e; }
table { width: 100%; border-collapse: collapse; } th, td { border: 1px solid #ccd; padding: 4px 5px; text-align: right; }
th { background: #eef2f9; } tr:nth-child(even) td { background: #fafbfd; } footer { margin-top: 8px; font-size: 8pt; color: #555; }
</style></head><body><header><img src="${LOGO_DATA_URI}"><div><h1>گزارش پرونده‌های پایان‌نامه — شمال‌داک</h1>
<div>دانشگاه شمال · تعداد: ${out.length} · تاریخ گزارش: ${esc(fdate(new Date().toISOString()))}</div></div></header>
<table><thead><tr><th>کد</th><th>عنوان</th><th>دانشجو</th><th>ش. دانشجویی</th><th>استاد راهنما</th><th>دانشکده</th><th>گروه</th><th>رشته / گرایش</th><th>وضعیت</th><th>ثبت</th><th>نمره</th><th>کد ایرانداک</th></tr></thead><tbody>
${out.map((r) => `<tr><td>${esc(r.code)}</td><td>${esc(r.title)}</td><td>${esc(r.student)}</td><td>${esc(r.studentNumber)}</td><td>${esc(r.supervisor)}</td><td>${esc(r.faculty)}</td><td>${esc(r.department)}</td><td>${esc([r.program, r.specialization].filter(Boolean).join(' / '))}</td><td>${esc(r.statusLabel)}</td><td>${esc(fdate(r.created))}</td><td>${r.defenseScore ?? '—'}</td><td>${esc(r.irandocCode)}</td></tr>`).join('')}
</tbody></table><footer>© ۱۴۰۵ دانشگاه شمال، معاونت پژوهش و فناوری — سامانهٔ شمال‌داک</footer></body></html>`;
    const pdf = await ZitePdf.renderHtml({ html, filename: `thesis-report-${Date.now()}.pdf` });
    return { pdfUrl: pdf.url, total: out.length };
  },
});
