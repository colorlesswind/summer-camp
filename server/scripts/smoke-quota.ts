/**
 * 报名名额（需求 2.1）并发冒烟测试。
 *
 * 直接连数据库、用真实事务验证「N 个并发占用不会超过 capacity」，
 * 不依赖 HTTP 服务；同时验证释放幂等与换导师迁移。
 * 跑完会把用到的两位测试导师恢复成 capacity=50 / used=0。
 *
 * 前置：数据库已执行 `npm run migrate`
 * 运行：`npm run smoke:quota`（或 npx tsx scripts/smoke-quota.ts）
 */
import { closePool, pool, withTransaction } from '../src/db/pool';
import { AppError } from '../src/common/errors';
import { supervisorQuota } from '../src/form/form.quota';

const CAPACITY = 5;
const CONCURRENCY = 50;

let failures = 0;

const check = (name: string, ok: boolean, extra?: unknown): void => {
  if (ok) {
    console.log(`  PASS  ${name}`);
    return;
  }
  failures += 1;
  console.log(`  FAIL  ${name}`, extra === undefined ? '' : JSON.stringify(extra));
};

const quotaOf = async (supervisorId: number): Promise<{ capacity: number; used: number }> => {
  const [rows] = await pool.execute<Array<{ quota_capacity: number; quota_used: number } & import('mysql2/promise').RowDataPacket>>(
    'SELECT quota_capacity, quota_used FROM supervisors WHERE id = ?',
    [supervisorId],
  );
  const row = rows[0];
  if (!row) throw new Error(`supervisor ${supervisorId} not found`);
  return { capacity: Number(row.quota_capacity), used: Number(row.quota_used) };
};

/** 找一位没有任何申请占位的导师，避免弄脏已有数据 */
const pickFreeSupervisor = async (exclude: number[] = []): Promise<number> => {
  const placeholders = exclude.length > 0 ? `AND s.id NOT IN (${exclude.map(() => '?').join(', ')})` : '';
  const [rows] = await pool.execute<Array<{ id: number } & import('mysql2/promise').RowDataPacket>>(
    `SELECT s.id
       FROM supervisors s
      WHERE NOT EXISTS (SELECT 1 FROM applications a WHERE a.quota_supervisor_id = s.id)
        ${placeholders}
      ORDER BY s.id DESC
      LIMIT 1`,
    exclude,
  );
  const row = rows[0];
  if (!row) throw new Error('没有空闲导师可用来做名额测试');
  return Number(row.id);
};

const resetSupervisor = async (supervisorId: number): Promise<void> => {
  await pool.execute(
    'UPDATE supervisors SET quota_capacity = 50, quota_used = 0, updated_at = UTC_TIMESTAMP(3) WHERE id = ?',
    [supervisorId],
  );
};

const acquireOnce = (supervisorId: number): Promise<'ok' | 'full'> =>
  withTransaction(async (conn) => {
    try {
      await supervisorQuota.acquire(conn, supervisorId, new Date());
      return 'ok' as const;
    } catch (error) {
      const code = error instanceof AppError ? (error.details as { code?: string } | undefined)?.code : undefined;
      if (code === 'quota_full') return 'full' as const;
      throw error;
    }
  });

const releaseOnce = (supervisorId: number): Promise<void> =>
  withTransaction((conn) => supervisorQuota.release(conn, supervisorId, new Date()));

const main = async (): Promise<void> => {
  let primary = 0;
  let secondary = 0;

  try {
    primary = await pickFreeSupervisor();
    secondary = await pickFreeSupervisor([primary]);

    await pool.execute(
      'UPDATE supervisors SET quota_capacity = ?, quota_used = 0, updated_at = UTC_TIMESTAMP(3) WHERE id = ?',
      [CAPACITY, primary],
    );

    console.log(`\n1) ${CONCURRENCY} 个并发占用 / 名额 ${CAPACITY}`);
    const outcomes = await Promise.all(
      Array.from({ length: CONCURRENCY }, () => acquireOnce(primary)),
    );
    const okCount = outcomes.filter((outcome) => outcome === 'ok').length;
    const fullCount = outcomes.filter((outcome) => outcome === 'full').length;
    const state = await quotaOf(primary);

    check(`成功数 = ${CAPACITY}（实际 ${okCount}）`, okCount === CAPACITY);
    check(`满额拒绝数 = ${CONCURRENCY - CAPACITY}（实际 ${fullCount}）`, fullCount === CONCURRENCY - CAPACITY);
    check(`quota_used = ${CAPACITY}（实际 ${state.used}）`, state.used === CAPACITY);

    console.log('\n2) 并发释放后归零');
    await Promise.all(Array.from({ length: CAPACITY }, () => releaseOnce(primary)));
    const afterRelease = await quotaOf(primary);
    check(`quota_used = 0（实际 ${afterRelease.used}）`, afterRelease.used === 0);

    console.log('\n3) 重复释放幂等（不会变负数）');
    await releaseOnce(primary);
    const afterDoubleRelease = await quotaOf(primary);
    check(`quota_used 仍为 0（实际 ${afterDoubleRelease.used}）`, afterDoubleRelease.used === 0);

    console.log('\n4) 换导师：同一事务内迁移占位');
    await pool.execute(
      'UPDATE supervisors SET quota_capacity = 1, quota_used = 0, updated_at = UTC_TIMESTAMP(3) WHERE id = ?',
      [secondary],
    );
    await acquireOnce(primary);
    await withTransaction((conn) =>
      supervisorQuota.transfer(conn, primary, secondary, new Date()),
    );
    const [movedA, movedB] = await Promise.all([quotaOf(primary), quotaOf(secondary)]);
    check(`旧导师释放（used=${movedA.used}）`, movedA.used === 0);
    check(`新导师占用（used=${movedB.used}）`, movedB.used === 1);

    await withTransaction((conn) =>
      supervisorQuota.transfer(conn, secondary, primary, new Date()),
    );
    const [backA, backB] = await Promise.all([quotaOf(primary), quotaOf(secondary)]);
    check(`迁回后旧导师 used=1（实际 ${backA.used}）`, backA.used === 1);
    check(`迁回后新导师 used=0（实际 ${backB.used}）`, backB.used === 0);

    console.log('\n5) 导师未变的 Resubmit 不重复占用');
    await withTransaction((conn) => supervisorQuota.transfer(conn, primary, primary, new Date()));
    const afterNoop = await quotaOf(primary);
    check(`used 仍为 1（实际 ${afterNoop.used}）`, afterNoop.used === 1);

    await releaseOnce(primary);
  } finally {
    if (primary > 0) await resetSupervisor(primary);
    if (secondary > 0) await resetSupervisor(secondary);
    await closePool();
  }

  console.log(failures === 0 ? '\n全部通过' : `\n${failures} 项失败`);
  process.exitCode = failures === 0 ? 0 : 1;
};

main().catch((error) => {
  console.error('smoke-quota failed:', error);
  process.exitCode = 1;
});
