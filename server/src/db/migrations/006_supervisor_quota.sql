-- =====================================================================
-- 006_supervisor_quota.sql —— 报名名额（需求 2.1）
--
-- 目标
--   1. 记录「这份申请当前占着哪位导师的名额」：释放时必须精确回退到原导师。
--      不能复用 reviewer_supervisor_id：学生在 Returned 状态 Save 时就会改
--      评审人，而名额要等 Resubmit 才迁移，两者生命周期并不相同。
--   2. 把历史数据回填成与状态一致：
--      Submit 成功到 Supervisor Reject / 学生 Decline Offer 之间一直占位，
--      因此 PendingForPreliminaryScreening / Returned /
--      PendingSupervisorReview / SupervisorRecommended / OfferSent /
--      OfferAccepted 都算「占位中」。
--
-- 并发口径（实现见 server/src/form/form.quota.ts）
--   占用只能走原子条件更新：
--     UPDATE supervisors SET quota_used = quota_used + 1
--      WHERE id = ? AND quota_used < quota_capacity
--   影响行数为 0 即名额已满（409 quota_full），InnoDB 行锁保证不超卖。
--   supervisors.chk_supervisors_quota 是最后一道兜底。
--
-- 说明：本文件不使用存储过程/触发器，可被 migrate.ts 按行尾分号切分执行
-- =====================================================================

ALTER TABLE applications
  ADD COLUMN quota_supervisor_id BIGINT UNSIGNED NULL
    COMMENT '当前占用名额的第一志愿导师（需求 2.1）；NULL=未占用或已释放',
  ADD KEY idx_applications_quota_supervisor (quota_supervisor_id),
  ADD CONSTRAINT fk_applications_quota_supervisor
    FOREIGN KEY (quota_supervisor_id) REFERENCES supervisors (id);

-- 回填：还在流程里的申请按第一志愿导师占位
UPDATE applications a
  JOIN application_program_choices c
    ON c.application_id = a.id
   AND c.choice_rank = 1
   AND c.supervisor_id IS NOT NULL
   SET a.quota_supervisor_id = c.supervisor_id
 WHERE a.quota_supervisor_id IS NULL
   AND a.status IN (
     'PendingForPreliminaryScreening',
     'Returned',
     'PendingSupervisorReview',
     'SupervisorRecommended',
     'OfferSent',
     'OfferAccepted'
   );

-- 以申请侧明细重算计数器：唯一事实来源是 applications.quota_supervisor_id
UPDATE supervisors s
  LEFT JOIN (
    SELECT quota_supervisor_id AS supervisor_id, COUNT(*) AS used
      FROM applications
     WHERE quota_supervisor_id IS NOT NULL
     GROUP BY quota_supervisor_id
  ) t ON t.supervisor_id = s.id
   SET s.quota_used = COALESCE(t.used, 0)
 WHERE s.quota_used <> COALESCE(t.used, 0);
