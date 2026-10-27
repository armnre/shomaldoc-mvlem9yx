import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { zite } from 'zitejs/db';
import { applyCommittee, assertEditable, audit, bad, chainSetting, findStudentThesis, first, forbidden, loadProposalForm, newVersion, requireAuth, validateAnswers, validateCommittee, withThesisLock } from '../lib/server';

const RULES = {
  topic: { from: ['TOPIC_REVISION'], to: 'GROUP_REVIEW', label: 'ارسال مجدد موضوع' },
  literature: { from: ['LITERATURE_REVIEW', 'LITERATURE_REVISION'], to: 'LITERATURE_SUPERVISOR_REVIEW', label: 'ارسال پیشینه تحقیق' },
  proposal: { from: ['PROPOSAL_DRAFT', 'PROPOSAL_REVISION'], to: 'PROPOSAL_REVIEW', label: 'ارسال پروپوزال' },
  final: { from: ['THESIS_ACTIVE', 'FINAL_REVISION'], to: 'FINAL_SUPERVISOR_REVIEW', label: 'ارسال نسخهٔ نهایی پایان‌نامه' },
} as const;

export default createEndpoint({
  description: 'Student submits a new version of topic, literature review or proposal',
  inputSchema: z.object({
    token: z.string(),
    kind: z.enum(['topic', 'literature', 'proposal', 'final']),
    content: z.string(),
    files: z.array(z.object({ url: z.string(), filename: z.string() })),
    formAnswers: z.record(z.string(), z.string()).optional(),
    /** Proposal only: extra supervisors (after the case's primary supervisor) and advisors, in order. Profile ids. */
    coSupervisorIds: z.array(z.string()).optional(),
    advisorIds: z.array(z.string()).optional(),
  }),
  outputSchema: z.object({ ok: z.boolean() }),
  execute: async ({ input }) => {
    const p = await requireAuth(input.token, ['student']);
    const t0 = await findStudentThesis(p.id);
    if (!t0) bad('پرونده‌ای یافت نشد.');
    return withThesisLock(t0.id, async () => {
    const t = (await zite.theses.findOne({ id: t0.id }))!;
    const rule = RULES[input.kind];
    if (!(rule.from as readonly string[]).includes(t.status ?? '')) forbidden('در وضعیت فعلی پرونده این ارسال مجاز نیست.');
    assertEditable(t);
    if (input.kind === 'literature' && !t.topicApprovedAt) forbidden('پیش از تأیید موضوع، ارسال پیشینهٔ تحقیق مجاز نیست.');
    if (input.kind === 'proposal') {
      // Both literature approvals (supervisor, then group manager) are required before a proposal can be filed.
      const lit = await zite.documentVersions.findOne({ filters: { thesis: t.id, kind: 'literature', isActive: true } });
      if (!lit || lit.reviewStatus !== 'approved') forbidden('ثبت پروپوزال پیش از تأیید پیشینه توسط استاد راهنما و مدیر گروه مجاز نیست.');
      if (!first(t.program)) bad('دانشکده، رشته و گرایش پرونده را انتخاب کنید.');
      await validateCommittee(t, input.coSupervisorIds ?? [], input.advisorIds ?? []);
    }
    let content = input.content.trim();
    let answersJson: string | undefined;
    if (input.kind === 'proposal') {
      const form = await loadProposalForm();
      if (form.fields.length) {
        const answers = input.formAnswers ?? {};
        validateAnswers(form.fields, answers);
        answersJson = JSON.stringify(answers);
        content = form.fields.filter((f) => answers[f.key]?.trim()).map((f) => `${f.label}:\n${answers[f.key].trim()}`).join('\n\n') + (content ? `\n\n${content}` : '');
      }
    }
    if (content.length < 20) bad('متن ارسالی باید حداقل ۲۰ نویسه باشد.');
    if ((input.kind === 'proposal' || input.kind === 'final') && input.files.length === 0) bad('بارگذاری فایل (Word یا PDF) الزامی است.');
    if (input.kind === 'proposal') await applyCommittee(t, input.coSupervisorIds ?? [], input.advisorIds ?? [], p, 'student');
    await newVersion({ thesisId: t.id, kind: input.kind, content, files: input.files, userId: p.id });
    const record: { status: string; proposalStep?: string; formAnswers?: string } = { status: rule.to };
    if (answersJson) record.formAnswers = answersJson;
    if (input.kind === 'proposal') record.proposalStep = (await chainSetting('proposalApprovalChain'))[0];
    await zite.theses.update({ id: t.id, record });
    await audit({ action: rule.label, actor: p.id, role: 'student', thesisId: t.id, from: t.status, to: rule.to });
    return { ok: true };
    });
  },
});
