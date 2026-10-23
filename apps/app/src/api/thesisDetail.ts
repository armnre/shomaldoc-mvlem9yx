import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite, type ZiteAttachment } from 'zitejs/db';
import { allowedActions, canView, findStudentThesis, first, forbidden, has, profileNames, requireAuth } from '../lib/server';

const fileOut = z.object({ url: z.string(), name: z.string() });
const files = (a?: ZiteAttachment[]) => (a ?? []).map((f) => ({ url: f.url, name: f.originalName || f.filename }));
const version = z.object({
  id: z.string(), kind: z.string(), versionNumber: z.number(), content: z.string(), files: z.array(fileOut),
  isActive: z.boolean(), reviewStatus: z.string(), reviewComment: z.string(), submittedBy: z.string(),
});
const s = (v?: string | null) => v ?? '';

export default createEndpoint({
  description: 'Returns a thesis case file with versions, requests, IranDoc, extensions, timeline and allowed actions',
  inputSchema: z.object({ token: z.string(), thesisId: z.string().optional() }),
  outputSchema: z.object({
    thesis: z.object({
      id: z.string(), code: z.string(), status: z.string(), proposalStep: z.string(), titleFa: z.string(), titleEn: z.string(),
      keywords: z.string(), problemStatement: z.string(), objectives: z.string(), studentName: z.string(), studentNumber: z.string(),
      departmentName: z.string(), departmentId: z.string(), supervisorId: z.string(), supervisorName: z.string(), advisorId: z.string(),
      advisorName: z.string(), supervisorRejections: z.number(), topicApprovedAt: z.string(), proposalApprovedAt: z.string(),
      thesisApprovedAt: z.string(), termsUsed: z.number(), allowedTerms: z.number(),
      similarityPercent: z.number().nullable(), plagiarismReport: z.array(fileOut), defenseDate: z.string(), defenseLocation: z.string(),
      defenseScore: z.number().nullable(), defenseGrade: z.string(), minutesPdf: z.array(fileOut), defendedAt: z.string(),
    }).nullable(),
    reviews: z.array(z.object({
      id: z.string(), reviewerName: z.string(), reviewerType: z.string(), verdict: z.string(), score: z.number().nullable(),
      comment: z.string(), files: z.array(fileOut), submittedAt: z.string(), round: z.number(), mine: z.boolean(),
    })),
    versions: z.array(version),
    requests: z.array(z.object({ id: z.string(), professorName: z.string(), status: z.string(), reason: z.string(), decidedAt: z.string() })),
    iranDoc: z.array(z.object({
      id: z.string(), trackingCode: z.string(), registeredOn: z.string(), receipt: z.array(fileOut), certificate: z.array(fileOut),
      reviewStatus: z.string(), reviewComment: z.string(), isActive: z.boolean(),
    })),
    extensions: z.array(z.object({
      id: z.string(), reason: z.string(), documents: z.array(fileOut), needsCommission: z.boolean(), commissionResult: z.string(),
      commissionNotes: z.string(), commissionFiles: z.array(fileOut), status: z.string(), chain: z.string(), decisions: z.string(),
      termNumber: z.number(), createdAt: z.string(),
    })),
    timeline: z.array(z.object({ id: z.string(), action: z.string(), actorName: z.string(), role: z.string(), from: z.string(), to: z.string(), comment: z.string(), at: z.string() })),
    allowedActions: z.array(z.string()),
  }),
  execute: async ({ input }) => {
    const p = await requireAuth(input.token);
    const t = input.thesisId ? await zite.theses.findOne({ id: input.thesisId }) : has(p, 'student') ? await findStudentThesis(p.id) : undefined;
    if (!t) return { thesis: null, reviews: [], versions: [] as z.infer<typeof version>[], requests: [], iranDoc: [] as never as { id: string; trackingCode: string; registeredOn: string; receipt: { url: string; name: string }[]; certificate: { url: string; name: string }[]; reviewStatus: string; reviewComment: string; isActive: boolean }[], extensions: [], timeline: [], allowedActions: [] };
    if (!(await canView(p, t))) forbidden('دسترسی به این پرونده مجاز نیست.');

    const [{ records: vs }, { records: rs }, { records: logs }, { records: ids }, { records: ex }] = await Promise.all([
      zite.documentVersions.findAll({ filters: { thesis: t.id }, limit: 500 }),
      zite.supervisorRequests.findAll({ filters: { thesis: t.id }, limit: 200 }),
      zite.auditLogs.findAll({ filters: { thesis: t.id }, limit: 1000 }),
      zite.iranDocRecords.findAll({ filters: { thesis: t.id }, limit: 50 }),
      zite.extensions.findAll({ filters: { thesis: t.id }, limit: 50 }),
    ]);
    const { records: rvs } = await zite.reviews.findAll({ filters: { thesis: t.id }, limit: 200 });
    const staff = !has(p, 'student') || t.studentId !== p.id;
    const names = await profileNames([
      s(t.studentId), s(t.supervisorId), s(t.advisorId), ...rs.map((r) => s(r.professorId)),
      ...logs.map((l) => s(l.actorId)), ...vs.map((v) => s(v.submittedById)), ...rvs.map((r) => s(r.reviewerId)),
    ]);
    const stu = t.studentId ? await zite.profiles.findOne({ id: t.studentId }) : undefined;
    const depId = first(t.department) ?? '';
    const dep = depId ? await zite.departments.findOne({ id: depId }) : undefined;
    return {
      thesis: {
        id: t.id, code: s(t.thesisCode), status: s(t.status), proposalStep: s(t.proposalStep), titleFa: s(t.titleFa), titleEn: s(t.titleEn),
        keywords: s(t.keywords), problemStatement: s(t.problemStatement), objectives: s(t.objectives),
        studentName: names[s(t.studentId)] ?? '', studentNumber: s(stu?.studentNumber), departmentName: s(dep?.name), departmentId: depId,
        supervisorId: s(t.supervisorId), supervisorName: names[s(t.supervisorId)] ?? '', advisorId: s(t.advisorId), advisorName: names[s(t.advisorId)] ?? '',
        supervisorRejections: t.supervisorRejections ?? 0, topicApprovedAt: s(t.topicApprovedAt), proposalApprovedAt: s(t.proposalApprovedAt),
        thesisApprovedAt: s(t.thesisApprovedAt), termsUsed: t.termsUsed ?? 0, allowedTerms: t.allowedTerms ?? 0,
        similarityPercent: t.similarityPercent ?? null, plagiarismReport: files(t.plagiarismReport), defenseDate: s(t.defenseDate),
        defenseLocation: s(t.defenseLocation), defenseScore: t.defenseScore ?? null, defenseGrade: s(t.defenseGrade),
        minutesPdf: files(t.minutesPdf), defendedAt: s(t.defendedAt),
      },
      reviews: rvs.map((r) => ({
        id: r.id, reviewerName: staff ? names[s(r.reviewerId)] ?? '' : '', reviewerType: s(r.reviewerType), verdict: s(r.verdict),
        score: r.score ?? null, comment: s(r.comment), files: files(r.files), submittedAt: s(r.submittedAt), round: r.round ?? 1,
        mine: r.reviewerId === p.id,
      })).sort((a, b) => b.round - a.round),
      versions: vs.map((v) => ({
        id: v.id, kind: s(v.kind), versionNumber: v.versionNumber ?? 0, content: s(v.content), files: files(v.files), isActive: !!v.isActive,
        reviewStatus: s(v.reviewStatus), reviewComment: s(v.reviewComment), submittedBy: names[s(v.submittedById)] ?? '',
      })).sort((a, b) => b.versionNumber - a.versionNumber),
      requests: rs.map((r) => ({ id: r.id, professorName: names[s(r.professorId)] ?? '', status: s(r.requestStatus), reason: s(r.reason), decidedAt: s(r.decidedAt) })),
      iranDoc: ids.map((r) => ({
        id: r.id, trackingCode: s(r.trackingCode), registeredOn: s(r.registeredOn), receipt: files(r.receipt), certificate: files(r.certificate),
        reviewStatus: s(r.reviewStatus), reviewComment: s(r.reviewComment), isActive: !!r.isActive,
      })).sort((a, b) => Number(b.isActive) - Number(a.isActive)),
      extensions: ex.map((e) => ({
        id: e.id, reason: s(e.reason), documents: files(e.documents), needsCommission: !!e.needsCommission, commissionResult: s(e.commissionResult),
        commissionNotes: s(e.commissionNotes), commissionFiles: files(e.commissionFiles), status: s(e.extensionStatus), chain: s(e.chain),
        decisions: s(e.decisions), termNumber: e.termNumber ?? 0, createdAt: s(e.created),
      })).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      timeline: logs.map((l) => ({
        id: l.id, action: s(l.action), actorName: names[s(l.actorId)] ?? '', role: s(l.actorRole), from: s(l.fromStatus), to: s(l.toStatus),
        comment: s(l.comment), at: s(l.created),
      })).sort((a, b) => b.at.localeCompare(a.at)),
      allowedActions: await allowedActions(p, t),
    };
  },
});
