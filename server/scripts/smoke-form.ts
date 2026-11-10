/**
 * 申请表模块端到端冒烟测试。
 *
 * 覆盖：表单配置 -> 导师候选 -> 首次 Save（生成 Application No.）-> 必填校验失败
 *      -> 整表单 Save -> Submit -> 重复 Submit（非法流转）-> 缺 CSRF
 *      -> 管理员初筛 Approve -> 导师可见性 -> Recommend -> 批量 Send Offer
 *      -> 学生 Accept Offer -> 终态只读
 *      -> 第二条申请走 Return / Resubmit 分支
 *
 * 运行前先启动服务（npm run dev），再执行 npx tsx scripts/smoke-form.ts
 * 脚本会自己建三个一次性账号（student / admin / supervisor）并绑定一位空闲导师，
 * 因此不会污染已有的预置账号。
 */
import { closePool, pool } from '../src/db/pool';
import { env } from '../src/config';
import { passwordService } from '../src/user/auth/password.service';
import { usersRepository } from '../src/user/user.repository';
import type { UserRole } from '../src/user/user.types';

const BASE = process.env['SMOKE_BASE_URL'] ?? `http://127.0.0.1:${env.port}`;
const PASSWORD = 'SmokePassw0rd!2026';
const stamp = Date.now();

let failures = 0;

const check = (name: string, ok: boolean, extra?: unknown): void => {
  if (ok) {
    console.log(`  PASS  ${name}`);
    return;
  }
  failures += 1;
  console.log(`  FAIL  ${name}`, extra === undefined ? '' : JSON.stringify(extra));
};

class Client {
  private readonly jar = new Map<string, string>();

  constructor(readonly label: string) {}

  private collect(res: Response): void {
    const raw = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
    for (const line of raw) {
      const pair = line.split(';')[0] ?? '';
      const index = pair.indexOf('=');
      if (index <= 0) continue;
      const name = pair.slice(0, index).trim();
      const value = pair.slice(index + 1).trim();
      if (value === '') this.jar.delete(name);
      else this.jar.set(name, value);
    }
  }

  async call(
    path: string,
    options: { method?: string; body?: unknown; csrf?: boolean } = {},
  ): Promise<{ status: number; body: any }> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const cookies = Array.from(this.jar.entries())
      .map(([name, value]) => `${name}=${value}`)
      .join('; ');
    if (cookies) headers['Cookie'] = cookies;
    if (options.csrf) {
      const token = this.jar.get(env.cookie.csrfName);
      if (token) headers['x-csrf-token'] = token;
    }

    const res = await fetch(`${BASE}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });

    this.collect(res);
    const text = await res.text();
    let body: any = text;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      /* 非 JSON 保持原文 */
    }
    return { status: res.status, body };
  }
}

const ensureUser = async (email: string, role: UserRole): Promise<string> => {
  const existing = await usersRepository.findByEmail(email);
  if (existing) return existing.id;

  const created = await usersRepository.create({
    email,
    passwordHash: await passwordService.hash(PASSWORD),
    emailVerifiedAt: new Date(),
    role,
  });
  return created.id;
};

const bindFreeSupervisor = async (userId: string, thrust: string): Promise<{ id: number; name: string } | null> => {
  const [rows] = (await pool.execute(
    'SELECT id, name FROM supervisors WHERE user_id IS NULL AND is_active = TRUE AND thrust_code = ? ORDER BY id LIMIT 1',
    [thrust],
  )) as unknown as [Array<{ id: number; name: string }>, unknown];

  const row = rows[0];
  if (!row) return null;
  await pool.execute('UPDATE supervisors SET user_id = ?, updated_at = ? WHERE id = ?', [userId, new Date(), row.id]);
  return row;
};

const login = async (client: Client, email: string): Promise<boolean> => {
  const res = await client.call('/user/logon', {
    method: 'POST',
    body: { grant_type: 'password', email, password: PASSWORD },
  });
  return res.status === 200;
};

const buildValues = (supervisorId: number) => ({
  lastNameEn: 'ZHANG',
  firstNameEn: 'San',
  fullNameZh: '张三',
  gender: 'MALE',
  dateOfBirth: '2002-05-01',
  idDocumentType: 'RESIDENT_ID',
  idDocumentNumber: '440101200205010000',
  needsStudentVisa: true,
  correspondenceAddress: '广州市黄埔区',
  phoneCountryCode: '+86',
  phoneNumber: '13800138000',
  programFirstId: 'AMAT',
  supervisorFirstId: supervisorId,
  programSecondId: null,
  supervisorSecondId: null,
  proposedResearchAreas: 'Advanced materials for energy storage',
  personalStatement: 'I am a motivated student ...',
  publications: [
    {
      pubTitle: 'A study on solid electrolytes',
      pubVenue: 'Journal of Materials',
      pubAuthors: 'ZHANG San',
      pubPublishDate: '2024-06-01',
      pubStatus: 'PUBLISHED',
      pubUrl: 'https://example.com/paper',
    },
  ],
  experiences: [
    {
      expType: 'INTERNSHIP',
      expOrganization: 'ACME Labs',
      expPosition: 'Research Intern',
      expPeriodStart: '2023-07-01',
      expPeriodEnd: '2023-09-30',
      expResponsibilities: 'Synthesised electrolytes',
    },
  ],
  consentDeclaration: true,
  consentMedia: false,
});

async function main(): Promise<void> {
  console.log(`# 申请表模块冒烟测试 -> ${BASE}`);

  const studentEmail = `smoke_stu_${stamp}@example.com`;
  const student2Email = `smoke_stu2_${stamp}@example.com`;
  const adminEmail = `smoke_admin_${stamp}@example.com`;
  const supervisorEmail = `smoke_sup_${stamp}@example.com`;
  const otherSupervisorEmail = `smoke_sup2_${stamp}@example.com`;

  const studentId = await ensureUser(studentEmail, 'student');
  await ensureUser(student2Email, 'student');
  await ensureUser(adminEmail, 'admin');
  const supervisorUserId = await ensureUser(supervisorEmail, 'supervisor');
  const otherSupervisorUserId = await ensureUser(otherSupervisorEmail, 'supervisor');

  const boundSupervisor = await bindFreeSupervisor(supervisorUserId, 'AMAT');
  const otherSupervisor = await bindFreeSupervisor(otherSupervisorUserId, 'EOAS');
  if (!boundSupervisor || !otherSupervisor) {
    throw new Error('没有空闲的导师档案可供冒烟测试绑定，请先执行 npm run migrate');
  }
  console.log(`  使用导师 #${boundSupervisor.id} ${boundSupervisor.name} / #${otherSupervisor.id} ${otherSupervisor.name}`);

  const student = new Client('student');
  const student2 = new Client('student2');
  const admin = new Client('admin');
  const supervisor = new Client('supervisor');
  const otherSupervisorClient = new Client('otherSupervisor');

  check('学生登录', await login(student, studentEmail));
  check('学生 2 登录', await login(student2, student2Email));
  check('管理员登录', await login(admin, adminEmail));
  check('导师登录', await login(supervisor, supervisorEmail));
  check('另一位导师登录', await login(otherSupervisorClient, otherSupervisorEmail));
  if (failures > 0) throw new Error('登录阶段失败，后续用例跳过');

  // ---------- 配置 ----------
  const schema = await student.call('/form/schema');
  check('GET /form/schema 200', schema.status === 200, schema.body);
  check('启用小节 6 个', schema.body?.data?.sections?.length === 6, schema.body?.data?.sections?.length);
  check(
    'gender 有 2 个选项',
    schema.body?.data?.sections?.[0]?.fields?.find((f: any) => f.code === 'gender')?.options?.length === 2,
  );
  check('返回提交窗口状态', typeof schema.body?.data?.meta?.submissionWindow?.isOpen === 'boolean');
  check('programs 枚举 4 个', schema.body?.data?.enums?.programs?.length === 4);

  const supervisorOptions = await student.call('/form/supervisors?programCode=AMAT&keyword=Bl&limit=50');
  check('GET /form/supervisors 200', supervisorOptions.status === 200, supervisorOptions.body);
  check('导师候选非空', (supervisorOptions.body?.data?.items?.length ?? 0) > 0);

  const badProgram = await student.call('/form/supervisors?programCode=XXXX');
  check('未知 Program -> 400 invalid_option', badProgram.status === 400 && badProgram.body?.code === 'invalid_option', badProgram.body);

  // ---------- 创建 + 必填校验 ----------
  const created = await student.call('/form/applications', {
    method: 'POST',
    csrf: true,
    body: { values: { lastNameEn: 'ZHANG' } },
  });
  check('POST /form/applications -> 201', created.status === 201, created.body);
  const applicationId = created.body?.data?.id as string;
  const applicationNumber = created.body?.data?.applicationNumber as string;
  check('生成 11 位 Application No.', typeof applicationNumber === 'string' && applicationNumber.length === 11, applicationNumber);
  check('初始状态 Draft', created.body?.data?.status === 'Draft');

  const duplicateCreate = await student.call('/form/applications', { method: 'POST', csrf: true, body: { values: {} } });
  check('同一账号重复创建 -> 409', duplicateCreate.status === 409, duplicateCreate.body);

  const earlySubmit = await student.call(`/form/applications/${applicationId}/submit`, { method: 'POST', csrf: true });
  check('缺必填 Submit -> 400 validation_failed', earlySubmit.status === 400 && earlySubmit.body?.code === 'validation_failed', earlySubmit.body);
  check('错误里带字段级明细', Array.isArray(earlySubmit.body?.errors) && earlySubmit.body.errors.length > 0);

  // ---------- Save + Submit ----------
  const saved = await student.call(`/form/applications/${applicationId}`, {
    method: 'PUT',
    csrf: true,
    body: { values: buildValues(boundSupervisor.id) },
  });
  check('PUT Save -> 200', saved.status === 200, saved.body);
  check('Save 回填 lastNameEn', saved.body?.data?.values?.lastNameEn === 'ZHANG');
  check('Save 回填 publications', saved.body?.data?.values?.publications?.length === 1);
  check('Save 后 actions 含 submit', Array.isArray(saved.body?.data?.actions) && saved.body.data.actions.includes('submit'));

  const mismatched = await student.call(`/form/applications/${applicationId}`, {
    method: 'PUT',
    csrf: true,
    body: { values: { supervisorFirstId: otherSupervisor.id } },
  });
  check('导师不属于所选 Program -> 400', mismatched.status === 400 && mismatched.body?.code === 'validation_failed', mismatched.body);

  const submitted = await student.call(`/form/applications/${applicationId}/submit`, { method: 'POST', csrf: true });
  check('Submit -> 200', submitted.status === 200, submitted.body);
  check('状态 PendingForPreliminaryScreening', submitted.body?.data?.status === 'PendingForPreliminaryScreening');
  check('学生端 displayStatus=Under Review', submitted.body?.data?.displayStatus === 'Under Review');

  const repeatSubmit = await student.call(`/form/applications/${applicationId}/submit`, { method: 'POST', csrf: true });
  check('重复 Submit -> 409 invalid_transition', repeatSubmit.status === 409 && repeatSubmit.body?.code === 'invalid_transition', repeatSubmit.body);

  const noCsrf = await student.call(`/form/applications/${applicationId}/submit`, { method: 'POST' });
  check('缺 CSRF -> 403', noCsrf.status === 403, noCsrf.body);

  const saveAfterSubmit = await student.call(`/form/applications/${applicationId}`, {
    method: 'PUT',
    csrf: true,
    body: { values: { lastNameEn: 'LI' } },
  });
  check('提交后 Save -> 409', saveAfterSubmit.status === 409, saveAfterSubmit.body);

  // ---------- 管理员初筛 ----------
  const adminList = await admin.call('/form/applications?status=PendingForPreliminaryScreening&page=1&pageSize=50');
  check('管理员列表按 status 过滤命中', (adminList.body?.data?.items ?? []).some((item: any) => item.id === applicationId), adminList.body?.data?.total);

  const supervisorBefore = await supervisor.call(`/form/applications/${applicationId}`);
  check('初筛前导师不可见（404）', supervisorBefore.status === 404);

  const returned = await admin.call(`/form/applications/${applicationId}/return`, {
    method: 'POST',
    csrf: true,
    body: { reason: '缺少成绩单' },
  });
  check('Return -> Returned 且记录原因', returned.body?.data?.status === 'Returned' && returned.body?.data?.returnReason === '缺少成绩单', returned.body);

  const resubmitted = await student.call(`/form/applications/${applicationId}/resubmit`, { method: 'POST', csrf: true });
  check('Resubmit -> PendingForPreliminaryScreening', resubmitted.body?.data?.status === 'PendingForPreliminaryScreening', resubmitted.body);

  const approved = await admin.call(`/form/applications/${applicationId}/approve`, { method: 'POST', csrf: true });
  check('Approve -> PendingSupervisorReview', approved.body?.data?.status === 'PendingSupervisorReview', approved.body);

  // ---------- 导师评审 ----------
  const supervisorList = await supervisor.call('/form/applications');
  check('导师列表能看到分配给自己的申请', (supervisorList.body?.data?.items ?? []).some((item: any) => item.id === applicationId));

  const otherDetail = await otherSupervisorClient.call(`/form/applications/${applicationId}`);
  check('非分配导师详情 404', otherDetail.status === 404);

  const otherRecommend = await otherSupervisorClient.call(`/form/applications/${applicationId}/recommend`, {
    method: 'POST',
    csrf: true,
    body: {},
  });
  check('非分配导师 Recommend 404', otherRecommend.status === 404);

  const recommended = await supervisor.call(`/form/applications/${applicationId}/recommend`, {
    method: 'POST',
    csrf: true,
    body: { reason: '背景匹配' },
  });
  check('Recommend -> SupervisorRecommended', recommended.body?.data?.status === 'SupervisorRecommended', recommended.body);
  check('导师端 displayStatus=Supervisor Recommended', recommended.body?.data?.displayStatus === 'Supervisor Recommended');

  const adminSendOffer = await admin.call(`/form/applications/${applicationId}/approve`, { method: 'POST', csrf: true });
  check('状态不符时 Approve -> 409', adminSendOffer.status === 409, adminSendOffer.body);

  // ---------- 批量 Offer ----------
  const batch = await admin.call('/form/offers/batch', { method: 'POST', csrf: true, body: { ids: [applicationId] } });
  check('批量 Send Offer 成功 1 条', batch.body?.data?.successCount === 1, batch.body?.data);
  check('批量失败数为 0', batch.body?.data?.failureCount === 0);

  const batchAgain = await admin.call('/form/offers/batch', { method: 'POST', csrf: true, body: { ids: [applicationId] } });
  check('重复批量 Offer 全部失败', batchAgain.body?.data?.successCount === 0 && batchAgain.body?.data?.failureCount === 1, batchAgain.body?.data);
  check('失败原因带 code', batchAgain.body?.data?.failures?.[0]?.code === 'invalid_transition', batchAgain.body?.data?.failures);

  // ---------- 学生 Accept ----------
  const studentList = await student.call('/form/applications');
  const ownItem = (studentList.body?.data?.items ?? []).find((item: any) => item.id === applicationId);
  check('学生列表 displayStatus=Pending for Offer Acceptance', ownItem?.displayStatus === 'Pending for Offer Acceptance', ownItem?.displayStatus);

  const accepted = await student.call(`/form/applications/${applicationId}/accept-offer`, { method: 'POST', csrf: true });
  check('Accept Offer -> OfferAccepted', accepted.body?.data?.status === 'OfferAccepted', accepted.body);
  check('学生端 displayStatus=Offer Accepted', accepted.body?.data?.displayStatus === 'Offer Accepted');
  check('终态 editable=false', accepted.body?.data?.editable === false);
  check('终态无可用动作', Array.isArray(accepted.body?.data?.actions) && accepted.body.data.actions.length === 0);

  const declineAfterAccept = await student.call(`/form/applications/${applicationId}/decline-offer`, {
    method: 'POST',
    csrf: true,
  });
  check('OfferAccepted 后 Decline -> 409', declineAfterAccept.status === 409, declineAfterAccept.body);

  // ---------- Return / Need Update 分支 ----------
  const created2 = await student2.call('/form/applications', {
    method: 'POST',
    csrf: true,
    body: { values: buildValues(boundSupervisor.id) },
  });
  const applicationId2 = created2.body?.data?.id as string;
  check('第二个学生创建成功', created2.status === 201, created2.body);

  const submitted2 = await student2.call(`/form/applications/${applicationId2}/submit`, { method: 'POST', csrf: true });
  check('第二个学生 Submit 成功', submitted2.body?.data?.status === 'PendingForPreliminaryScreening', submitted2.body);

  await admin.call(`/form/applications/${applicationId2}/return`, {
    method: 'POST',
    csrf: true,
    body: { reason: '请补充排名证明' },
  });
  const mine2 = await student2.call('/form/applications/mine');
  check('GET /form/applications/mine 返回本人申请', mine2.body?.data?.id === applicationId2);
  check('学生端 displayStatus=Need Update', mine2.body?.data?.displayStatus === 'Need Update');
  check('Returned 状态可编辑', mine2.body?.data?.editable === true);
  check('actions 含 resubmit', (mine2.body?.data?.actions ?? []).includes('resubmit'));

  const noReasonReturn = await admin.call(`/form/applications/${applicationId2}/return`, {
    method: 'POST',
    csrf: true,
    body: {},
  });
  check('Return 缺原因 -> 400', noReasonReturn.status === 400, noReasonReturn.body);

  // ---------- 详情 / 历史 ----------
  const detail = await admin.call(`/form/applications/${applicationId}`);
  check('管理员详情 200', detail.status === 200);
  check('详情带 timeline', (detail.body?.data?.timeline ?? []).length >= 4, (detail.body?.data?.timeline ?? []).length);
  check('timeline 记录 return 动作', (detail.body?.data?.timeline ?? []).some((entry: any) => entry.action === 'return'));

  const history = await admin.call(`/form/applications/${applicationId}/history`);
  check('GET history 200', history.status === 200 && Array.isArray(history.body?.data?.timeline));

  const notFound = await admin.call('/form/applications/01JQ0000000000000000000009');
  check('不存在的申请 -> 404', notFound.status === 404);

  console.log(`\n# 学生账号 ${studentEmail}（id=${studentId}）`);
  console.log(`# 结果：${failures === 0 ? '全部通过' : `${failures} 条失败`}`);
}

main()
  .catch((error) => {
    failures += 1;
    console.error('smoke-form 运行失败：', error);
  })
  .finally(async () => {
    await closePool();
    process.exitCode = failures === 0 ? 0 : 1;
  });
