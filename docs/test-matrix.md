# Summer Camp 报名系统 · 功能测试矩阵（Test Matrix）

> 依据：[笔试题-全栈.md](../笔试题-全栈.md) 的「功能需求 / 规则 / 技术要求」
> 基线代码：`81e0f82`（2026-11-10）
> 角色：学生（Student）/ 管理员（Admin）/ 导师（Supervisor）
> 本文只给**用例设计与覆盖映射**，执行结果栏留空，按 §10 的记录方式回填。

---

## 1. 范围与非目标

### 1.1 范围内

| 模块 | 内容 |
| --- | --- |
| 认证 | 学生邮箱验证码登录、管理员/导师密码登录、JWT 会话、CSRF、Origin、登出、刷新 |
| 学生端 | 新建申请（首次 Save）、Save、Submit、Resubmit、列表/状态页、Accept/Decline Offer |
| 管理端 | 列表筛选、详情、Approve、Return（原因）、单条/批量 Send Offer |
| 导师端 | 列表筛选、详情、Recommend、Reject、可见性隔离 |
| 状态机 | 9 个状态 × 10 个动作 × 3 个角色的合法性与非法拒绝 |
| 展示 | 三端状态文案、`displayStatus`、终态只读 |
| 配置化 | 表单字段/必填/选项/最大长度由数据库驱动；提交时间窗口由数据库配置 |
| 名额 | 默认 50、Submit 占用、Resubmit 迁移、Reject/Decline 释放、并发不超卖 |
| 批量 Offer | 并行子流程、单条超时、成功/失败/原因汇总 |
| 非功能 | 越权、并发、重复提交、限流、敏感信息、英文界面、加载/空/错状态 |

### 1.2 非目标（本期不测实现，只测「不该出现」）

- Applicant's Educational Background、Awards and Professional Qualifications、Supporting Documents、English Language Proficiency 四个模块不实现。
- 不实现 Due Date 业务与时间配置页。
- 不做真实邮件投递验收（允许 Mock 邮件，验证码可由日志获取）。

---

## 2. 环境与数据基线

### 2.1 环境

| 项 | 值 |
| --- | --- |
| 后端 | `http://localhost:3000`，健康检查 `GET /healthz` |
| 前端 | `http://localhost:5173`（Vite 代理 `/user`、`/form`、`/healthz`） |
| 数据库 | MySQL 8（`docker compose up -d --build` 或本地实例） |
| 迁移 | `cd server && npm run migrate`（`004` 参考数据、`005` 导师、`006` 名额必须执行） |
| 浏览器 | Chrome 最新版 + 一个不同尺寸视口（1280 / 768） |

### 2.2 账号

| 角色 | 来源 | 用途 |
| --- | --- | --- |
| Admin | `BOOTSTRAP_ADMIN_*` / `npm run seed:accounts` | 初筛、Send Offer、批量 |
| Supervisor A | `BOOTSTRAP_SUPERVISOR_1_*`，且 `supervisors.user_id` 已绑定 | 正常评审 |
| Supervisor B | `BOOTSTRAP_SUPERVISOR_2_*`，绑定另一导师 | 越权/可见性对照 |
| Student 1..N | 任意邮箱 OTP 登录自动开户 | 主流程、并发、名额 |
| 无档案 Supervisor | `role=supervisor` 但无 `supervisors` 行 | 403 `supervisor_not_registered` |

> 每个用例使用独立邮箱（`qa_<case>_<timestamp>@example.com`），避免「一人一份申请」唯一约束互相污染。

### 2.3 关键测试数据与构造方式

| 场景 | 构造方式 | 注意事项 |
| --- | --- | --- |
| 提交窗口开放 | 默认种子：`2026-11-01 00:00` ~ `2026-12-31 15:59:59` | 与当前系统时间比较，跨时区用 UTC |
| 窗口未开始 | `UPDATE submission_windows SET opens_at = UTC_TIMESTAMP() + INTERVAL 1 DAY, closes_at = UTC_TIMESTAMP() + INTERVAL 2 DAY` | Save 允许、Submit 拒绝 |
| 窗口已结束 | `UPDATE submission_windows SET is_active = 0`（或 `closes_at` 改为过去） | Draft 只读；Returned 仍可 Save/Resubmit |
| 完全无窗口配置 | `DELETE FROM submission_windows`（仅隔离库） | 当前实现视为「不限制」，见 §9-04 |
| 名额将满 | `UPDATE supervisors SET quota_capacity=1, quota_used=0 WHERE id=?` | 用后恢复，避免污染演示数据 |
| 表单配置变更 | 直接改 `form_fields` / `form_options` / `form_sections` | 进程内缓存 30s，必要时重启服务 |
| 状态直达某节点 | 走完整 API 流程（推荐）或 SQL 更新 `applications.status` + 补 `status_logs` | 直接改库会绕开配额/审计，只用于构造只读场景 |

### 2.4 接口契约基线

- 成功：`{ "code": 0, "message": "ok", "data": ... }`，创建接口 HTTP 201，其余 200。
- 失败：RFC7807 风格 `{ status, code, message, detail, errors? }`；`errors` 为字段级明细。
- 鉴权：access/refresh 放 HttpOnly Cookie；写操作必须带 `X-CSRF-Token`（双提交 Cookie）。
- 常用错误码：`validation_failed`、`invalid_option`、`invalid_transition`、`submission_window_closed`、`quota_full`、`application_exists`、`role_forbidden`、`not_resource_owner`、`forbidden`、`csrf_token_invalid`、`origin_not_allowed`、`not_found`、`unauthorized`、`invalid_grant`、`rate_limited`。

---

## 3. 需求追踪矩阵

| ID | 需求（来源） | 验收要点 | 用例 |
| --- | --- | --- | --- |
| R01 | 学生邮箱验证码登录，有效期 1 小时（2.1.1） | 生成/校验/过期均由后端完成；单次使用；可 Mock 邮件 | AUTH-01~07 |
| R02 | 学生以登录邮箱为唯一标识（2.1.1 / 2.4） | 同一邮箱仅一份申请 | STU-03、STU-29、SEC-01 |
| R03 | 学生列表/状态页（2.1.2） | 只读本人；无折叠；无 Due Date；英文；含历史状态 | SM-09、UI-03~05 |
| R04 | Accept/Decline 仅 `OfferSent`，二次确认（2.1.2） | 状态约束 + 确认弹窗 | STU-25~28、UI-06 |
| R05 | Save 规则（2.1.3） | 不校验必填；首次生成 Draft + Application No.；窗口约束；Returned 可改；其他只读 | STU-02、04~14 |
| R06 | Submit 仅 Draft，校验必填/格式，窗口内（2.1.3） | 前后端双重限制 | STU-15~20、SM-06 |
| R07 | Resubmit 仅 Returned，同 Submit 校验，不受窗口（2.1.3） | 窗口外也能重提 | STU-21~23 |
| R08 | 管理员/导师用预设账号密码登录（2.2.1 / 2.3.1） | 统一错误提示；未验证邮箱 403 | AUTH-08~10 |
| R09 | 管理端列表（可按 status 筛选）+ 详情只读（2.2.2） | 全量可见；字段只读；按状态给动作 | ADM-01~02、SM-04~05 |
| R10 | Approve / Return（原因必填）（2.2.2） | 409 非法流转；原因入库并透出学生端 | ADM-03~06 |
| R11 | Send Offer（支持批量）（2.2.2 / 2.4） | 仅 `SupervisorRecommended`；汇总成功/失败/原因 | ADM-07~13、BAT-01~05 |
| R12 | 首次 Submit 开始/结束时间仅存数据库（2.2.3） | 无配置页；窗口外前后端均拒绝 | SM-06、STU-11~13、UI-07 |
| R13 | 导师仅见分配给本人且已进入审核的申请（2.3.2） | 列表排除；详情 404；筛选不可见状态返回空 | SUP-02、SUP-03、SM-07 |
| R14 | Recommend / Reject 仅 `PendingSupervisorReview`（2.3.2） | 列表与详情可操作；单条；处理后只读 | SUP-04~06、SUP-09 |
| R15 | 状态流转同时校验 status + role，非法拒绝（2.4） | 403 / 409 / 404 区分清楚 | §4 真值表、SEC-01~02 |
| R16 | 前后端状态值一致（2.4） | API `status` 与库值一致；前端常量一致 | SM-01、SM-02 |
| R17 | 三端展示文案（状态与展示） | 管理/导师一致；学生折叠规则按确认口径 | SM-02、SM-08 |
| R18 | 表单配置化（三.1） | 增删字段/必填/选项尽量不改代码；库表可扩展 | CFG-01~08 |
| R19 | 名额先到先得（三.2.1） | 默认 50；Submit 占用；Resubmit 不重复/可迁移；Reject/Decline 释放；并发不超卖；500 并发方案 | QTA-01~13 |
| R20 | 批量 Send Offer 并行（三.2.2） | 子流程并行、超时判失败、汇总返回 | BAT-01~05 |
| R21 | REST JSON + `{code,message,data}` + JWT 角色鉴权（一.4/一.5） | 契约统一；角色与资源双重校验 | AUTH-11~16、SEC-01~04 |
| R22 | 三端英文界面（五） | 无中文文案残留 | UI-01、UI-08 |
| R23 | 四个可选模块不实现（2.1.3 / 五） | 页面不渲染、接口不接受对应字段 | CFG-08 |
| R24 | Due Date 不实现（2.1.2 / 2.4） | 不出现在列表、不参与流转 | UI-05（见 §9-01） |

---

## 4. 状态迁移真值表（直接可执行）

行 = 当前 `status`，列 = 动作；单元格 = 允许的角色与目标状态。

| 当前状态 | Save | Submit | Resubmit | Return | Approve | Recommend | Reject | Send Offer | Accept | Decline |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `Draft` | 学生 → `Draft` | 学生 → `PendingForPreliminaryScreening` | — | — | — | — | — | — | — | — |
| `PendingForPreliminaryScreening` | — | — | — | Admin → `Returned` | Admin → `PendingSupervisorReview` | — | — | — | — | — |
| `Returned` | 学生 → `Returned` | — | 学生 → `PendingForPreliminaryScreening` | — | — | — | — | — | — | — |
| `PendingSupervisorReview` | — | — | — | — | — | 导师 → `SupervisorRecommended` | 导师 → `SupervisorRejected` | — | — | — |
| `SupervisorRecommended` | — | — | — | — | — | — | — | Admin → `OfferSent` | — | — |
| `SupervisorRejected` | — | — | — | — | — | — | — | — | — | — |
| `OfferSent` | — | — | — | — | — | — | — | — | 学生 → `OfferAccepted` | 学生 → `OfferDeclined` |
| `OfferAccepted` | — | — | — | — | — | — | — | — | — | — |
| `OfferDeclined` | — | — | — | — | — | — | — | — | — | — |

**判定口径**

| 场景 | 期望 |
| --- | --- |
| 角色与路由不匹配（如学生调 approve） | `403`，`code=forbidden` |
| 角色匹配但状态不允许（如对 `Draft` 调 approve） | `409`，`code=invalid_transition`，`detail` 含 `current` / `allowedFrom` |
| 学生操作他人申请 | `403`，`code=not_resource_owner` |
| 导师操作/查看未分配或未进入审核的申请 | `404`，`code=not_found`（不暴露存在性） |
| 提交窗口外 Submit | `409`，`code=submission_window_closed` |
| 名额已满 Submit/Resubmit | `409`，`code=quota_full` |
| 同一账号重复建单 | `409`，`code=application_exists` |
| ID 非 26 位 ULID | `400`，`code=validation_failed` |

---

## 5. 展示矩阵（三端）

| 内部 `status` | Admin 列表/详情 | Supervisor 列表/详情 | 学生 `displayStatus` | 导师可见 |
| --- | --- | --- | --- | --- |
| `Draft` | Draft | 不可见 | Draft | ✗ |
| `PendingForPreliminaryScreening` | Pending For Preliminary Screening | 不可见 | Under Review | ✗ |
| `Returned` | Returned | 不可见 | Pending for Update（见 §9-02） | ✗ |
| `PendingSupervisorReview` | Pending Supervisor Review | Pending Supervisor Review | Under Review | ✓ |
| `SupervisorRecommended` | Supervisor Recommended | Supervisor Recommended | Recommended（见 §9-02） | ✓ |
| `SupervisorRejected` | Supervisor Rejected | Supervisor Rejected | Rejected | ✓ |
| `OfferSent` | Offer Sent | Offer Sent | Pending for Offer Acceptance | ✓ |
| `OfferAccepted` | Offer Accepted | Offer Accepted | Offer Accepted | ✓ |
| `OfferDeclined` | Offer Declined | Offer Declined | Offer Declined | ✓ |

---

## 6. 用例矩阵

> 优先级：**P0** 发布阻断（主流程/越权/数据一致性）；**P1** 重要分支与负向；**P2** 边界与体验。
> 覆盖标记：`●` 已有自动化（脚本/Postman/接口测试）；`◐` 仅有规则级单测或部分覆盖；`○` 未覆盖，需手工/补自动化。

### 6.1 认证与鉴权（AUTH）

| ID | 需求 | 前置 | 步骤 | 期望（HTTP / code / DB） | P | 层 | 覆盖 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| AUTH-01 | R01 | 新邮箱 | `POST /user/otp {email, purpose:logon}` | 200，`accepted=true`，`expiresInSeconds=3600`；日志出现 `[DEV MAIL]`；`otp_challenges` 新增 `purpose=logon`，`expires_at≈+1h` | P0 | API/DB | ● |
| AUTH-02 | R01 | 已发码 | 用错误 6 位码登录 | 401 `invalid_grant`；`attempts` +1；不建会话 | P0 | API | ◐ |
| AUTH-03 | R01 | `expires_at` 改为过去 | 用正确码登录 | 401 `invalid_grant`；不建会话 | P0 | API/DB | ◐ |
| AUTH-04 | R01 | 已发码 | 连续错 5 次后再用正确码 | 401 `invalid_grant`（尝试次数过多）；正确码也不可用 | P1 | API | ◐ |
| AUTH-05 | R01 | 60s 内重复发码 | 再次 `POST /user/otp` | 429 `rate_limited`，带 `Retry-After`；不重复发信 | P1 | API | ◐ |
| AUTH-06 | R01 | 已验证的码 | 用同一个码二次登录 | 401 `invalid_grant`（已被使用） | P0 | API | ◐ |
| AUTH-07 | R01/R02 | 新邮箱 | OTP 登录成功 | 200 + Set-Cookie；自动建 `users`（`role=student`，`email_verified_at` 非空）；`/user/me` 返回该用户 | P0 | API/DB | ● |
| AUTH-08 | R08 | Admin/Supervisor 预设账号 | `POST /user/logon {grant_type:password}` | 200；cookie 可访问 `/form/*`；错误密码统一 401 `invalid_grant`（不区分账号不存在） | P0 | API | ● |
| AUTH-09 | R08 | 已注册未验证邮箱账号 | 正确密码登录 | 403 `email_unverified` | P1 | API | ● |
| AUTH-10 | R21 | 无 Cookie | 直接访问 `/form/applications`、`/user/me` | 401 `unauthorized` | P0 | API | ● |
| AUTH-11 | R15 | Student 已登录 | 调 `POST /form/applications/:id/approve` | 403 `forbidden`；状态与审计不变 | P0 | API | ● |
| AUTH-12 | R21 | 已登录 | 写操作不带 `X-CSRF-Token` / 与 Cookie 不一致 | 403 `csrf_token_invalid`；无副作用 | P0 | API | ● |
| AUTH-13 | R21 | 已登录 | 写请求带非法 `Origin` | 403 `origin_not_allowed`；无副作用 | P1 | API | ● |
| AUTH-14 | R21 | 已登录 | 等待 access 过期后调用；再刷新 | 401 → `POST /user/token/refresh` 200；旧 refresh 复用被拒 | P1 | API | ● |
| AUTH-15 | R21 | 已登录 | `POST /user/logout` 后再用旧 access | 200 登出；旧 access 401（denylist）；Cookie 清除 | P0 | API | ● |
| AUTH-16 | R21 | 同一邮箱 | 连续 10 次错误密码，第 11 次用正确密码 | 第 11 次 429 `rate_limited`（`logon:email` 10 次/15 分钟）；成功登录会清零计数 | P2 | API | ◐ |

### 6.2 学生端：保存 / 提交 / 重提（STU）

| ID | 需求 | 前置 | 步骤 | 期望 | P | 层 | 覆盖 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| STU-01 | R18 | 已登录学生 | `GET /form/schema`、`GET /form/supervisors?programCode=AMAT` | 200；6 个启用小节；`meta.submissionWindow`、`meta.canSaveDraft`；导师项含 `remaining/isFull` | P0 | API | ● |
| STU-02 | R05 | 无申请 | `POST /form/applications {values:{...}}` | 201；`status=Draft`；11 位 `applicationNumber`；明细/志愿/子表落库；`status_logs` 记 `save null→Draft` | P0 | API/DB | ● |
| STU-03 | R02 | 已有申请 | 再次 `POST /form/applications` | 409 `application_exists`；原申请不变 | P0 | API | ● |
| STU-04 | R05 | Draft | `PUT .../:id` 只传部分字段 | 200；传入字段更新，未传字段保留；`updated_at` 变化 | P0 | API | ● |
| STU-05 | R05 | 新申请 | Save 时不填任何必填项 | 200，允许保存（Save 不做必填校验） | P0 | API | ● |
| STU-06 | R18 | Draft | Save 传未知字段 `foo` | 400 `validation_failed`，`errors[].code=unknown_field`；不落库 | P0 | API | ● |
| STU-07 | R18 | Draft | 传错类型/非法日期/超长文本/非法选项 | 400 `validation_failed`，逐字段 `invalid_type` / `invalid_format` / `too_long` / `invalid_option` | P1 | API | ◐ |
| STU-08 | R18 | Draft | 只填第二志愿导师、不填第二志愿 Program | 400 `validation_failed`，`missing_dependency` | P1 | API | ◐ |
| STU-09 | R05 | Draft | 两个志愿选同一 Program / 同一导师 / 导师不属于所选 Program | 400，`duplicate_program` / `duplicate_supervisor` / `supervisor_program_mismatch` | P0 | API | ● |
| STU-10 | R05/R12 | 窗口未开始（存在未来窗口） | Draft Save | 200（可提前保存） | P0 | API | ○ |
| STU-11 | R05/R12 | 窗口内 | Draft Save | 200 | P0 | API | ● |
| STU-12 | R05/R12 | 所有窗口已结束 | Draft Save（`PUT`）与首次建单（`POST`） | 均 409 `submission_window_closed`；库中内容不变；UI Save 不可用/只读 | P0 | API/UI | ○ |
| STU-13 | R05 | 窗口已结束、`Returned` | Save | 200；状态仍 `Returned`；内容更新 | P0 | API | ○ |
| STU-14 | R05 | `PendingForPreliminaryScreening` / `PendingSupervisorReview` / `OfferSent` 等 | 尝试 Save | 409 `invalid_transition`；UI 只读、无 Save | P0 | API/UI | ● |
| STU-15 | R06 | Draft 且字段完整、窗口内 | `POST .../submit` | 200 → `PendingForPreliminaryScreening`；`submitted_at` 写入；`reviewer_supervisor_id`=第一志愿导师；`quota_used +1`；审计 1 条 | P0 | API/DB | ● |
| STU-16 | R06 | Draft，缺必填 | Submit | 400 `validation_failed`（含必填字段 `errors`）；状态仍 Draft；不占名额 | P0 | API/DB | ● |
| STU-17 | R12 | Draft，窗口外 | Submit | 409 `submission_window_closed`；UI 按钮禁用 | P0 | API/UI | ○ |
| STU-18 | R06 | Draft 已保存 | 在 Submit 请求体里塞新值（接口本不接收 body） | 以**库中已保存内容**校验；请求体不影响结果 | P1 | API | ○ |
| STU-19 | R15 | 已 `PendingForPreliminaryScreening` | 再次 Submit | 409 `invalid_transition` | P0 | API | ● |
| STU-20 | R19 | 第一志愿导师名额已满 | Draft Submit | 409 `quota_full`；状态仍 Draft；`quota_used` 不变；无审计写入 | P0 | API/DB | ● |
| STU-21 | R07 | `Returned`，窗口已结束 | Resubmit | 200 → `PendingForPreliminaryScreening`（不受窗口限制） | P0 | API | ○ |
| STU-22 | R07 | `Returned`，库中内容仍缺必填 | Resubmit | 400 `validation_failed`；状态仍 `Returned` | P0 | API | ○ |
| STU-23 | R15 | `Draft` / `OfferSent` | Resubmit | 409 `invalid_transition` | P1 | API | ● |
| STU-24 | R03 | 无申请 | `GET /form/applications/mine` | 200 `data=null`；UI 展示 Draft 占位行与 Application Form 按钮 | P1 | API/UI | ● |
| STU-25 | R04 | `OfferSent` | Accept Offer | 200 → `OfferAccepted`；`actions=[]`、`editable=false`；审计 1 条；名额保持占用 | P0 | API/DB | ● |
| STU-26 | R04/R19 | `OfferSent` | Decline Offer | 200 → `OfferDeclined`；释放导师名额（`quota_used -1`，`quota_supervisor_id=NULL`） | P0 | API/DB | ○ |
| STU-27 | R15 | `OfferAccepted` / `OfferDeclined` / `Draft` | Accept 或 Decline | 409 `invalid_transition` | P0 | API | ● |
| STU-28 | R04 | `OfferSent` | UI 点 Respond → Accept/Decline | 先弹选择框，再二次确认；取消不调接口；失败提示并刷新状态 | P0 | UI | ○ |
| STU-29 | R02 | 同一邮箱重新登录 | 查看 `/mine` | 仍为原申请（同一 user 唯一约束），不能新建第二份 | P0 | API/DB | ● |
| STU-30 | R05 | 并发首次建单（同账号） | 两请求同时 `POST /form/applications` | 仅 1 条成功，另一条 409；`application_number` 唯一且连续 | P2 | API/DB | ○ |

### 6.3 状态机、列表与展示（SM）

| ID | 需求 | 前置 | 步骤 | 期望 | P | 层 | 覆盖 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| SM-01 | R15/R16 | 构造 9 个状态 | 按 §4 真值表逐格执行 10 个动作 | 合法格成功且目标状态正确；非法格 409 `invalid_transition`；所有结果与真值表一致 | P0 | API/DB | ◐ |
| SM-02 | R16/R17 | 各状态一条数据 | 三端分别取列表与详情 | 文案与 §5 完全一致（含大小写）；`status` 原样返回 | P0 | API/UI | ● |
| SM-03 | R17 | 任意状态 | 查看 `displayStatus` | 学生端为业务文案；管理/导师端为内部状态可读化文案 | P1 | API | ● |
| SM-04 | R09 | Admin | `GET /form/applications?status=NotAStatus` | 400 `validation_failed` | P1 | API | ● |
| SM-05 | R09 | Admin | `?status=A&status=B` 与 `?status=A,B` | 两种写法等价，返回并集 | P1 | API | ◐ |
| SM-06 | R09 | 三条不同状态 | `page=0` / `pageSize=101` / 默认值 | 越界 400；默认 `page=1,pageSize=20` | P2 | API | ● |
| SM-07 | R13 | Supervisor | `?status=Draft` 或无筛选 | 筛选不可见状态返回空列表；无筛选只返回可见 6 状态且仅本人被分配 | P0 | API | ● |
| SM-08 | R17 | 有多次 Save/Return | `GET .../:id/history` | 时间线含动作、前后状态、角色、备注、时间；顺序正确 | P1 | API | ● |
| SM-09 | R03 | 学生有多段状态历史 | 打开 Application Status | 当前状态在第一行且加粗；历史倒序；无折叠/展开；不出现未实现的 6 个 reserved 状态 | P1 | UI | ○ |
| SM-10 | R17 | `Returned` | 学生列表 | Return Reason 显示最近一次退回原因；历史行显示对应历史原因 | P1 | UI | ○ |

### 6.4 管理端（ADM）

| ID | 需求 | 前置 | 步骤 | 期望 | P | 层 | 覆盖 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ADM-01 | R09 | Admin | 列表不筛选 / 按状态筛选 / 关键词搜索 | 全量可见；筛选结果状态单一；关键词命中姓名/申请号/邮箱（按实现） | P0 | API/UI | ● |
| ADM-02 | R09 | 任意状态 | 打开详情 | 字段只读（无输入框）；动作按钮集合 = 服务端 `actions` | P0 | API/UI | ● |
| ADM-03 | R10 | `PendingForPreliminaryScreening` | Approve | 200 → `PendingSupervisorReview`；审计 1 条；导师端立即可见 | P0 | API/DB | ● |
| ADM-04 | R15 | `Draft` / `SupervisorRecommended` | Approve | 409 `invalid_transition` | P0 | API | ● |
| ADM-05 | R10 | `PendingForPreliminaryScreening` | Return 缺 `reason` / 空白 / 超 1000 字 | 400 `validation_failed`；状态不变 | P0 | API | ◐ |
| ADM-06 | R10 | 同上 | Return 合法原因 | 200 → `Returned`；`return_reason` 入库；学生端可见并可编辑 | P0 | API/DB | ● |
| ADM-07 | R11 | `SupervisorRecommended` | 单条 `POST .../send-offer` | 200 → `OfferSent`；学生端 Actions 出现 Respond | P1 | API | ● |
| ADM-08 | R15 | `PendingSupervisorReview` | 单条 Send Offer | 409 `invalid_transition` | P0 | API | ● |
| ADM-09 | R11 | 混合状态若干 | 批量 Send Offer | 仅 `SupervisorRecommended` 成功；返回 `total/successCount/failureCount/failures[].code` | P0 | API | ● |
| ADM-10 | R11 | 同一 id 重复提交 | 批量 Send Offer | 去重后只处理一次；`total` 为去重后数量 | P1 | API | ○ |
| ADM-11 | R11 | — | 空数组 / 101 条 / 非法 ID | 400 `validation_failed`；不产生任何状态变更 | P1 | API | ◐ |
| ADM-12 | R11 | Admin | 详情页动作区 | 只有符合状态时出现 Approve/Return/Send Offer；操作中其余按钮禁用 | P1 | UI | ○ |

### 6.5 导师端（SUP）

| ID | 需求 | 前置 | 步骤 | 期望 | P | 层 | 覆盖 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| SUP-01 | R08 | Supervisor A | 密码登录 → 打开列表 | 200；仅 A 名下、`PendingSupervisorReview` 起的申请 | P0 | API/UI | ● |
| SUP-02 | R13 | 存在 Draft/PFS/Returned 的申请 | A 查看列表/详情 | 列表不出现；详情 404 `not_found`；筛选这些状态返回空 | P0 | API | ● |
| SUP-03 | R13 | 申请分配给 B | A 查看详情 / Recommend | 404 `not_found`；B 可正常查看 | P0 | API | ● |
| SUP-04 | R14 | `PendingSupervisorReview`，分配给 A | Recommend（可选备注） | 200 → `SupervisorRecommended`；备注入审计；名额保持占用 | P0 | API/DB | ● |
| SUP-05 | R14/R19 | 同上 | Reject | 200 → `SupervisorRejected`（终态）；释放名额；学生端显示 Rejected | P0 | API/DB | ○ |
| SUP-06 | R15 | `SupervisorRecommended` | 再次 Recommend/Reject | 409 `invalid_transition`；无副作用 | P0 | API | ● |
| SUP-07 | R14 | 已处理状态 | 打开详情 | 只读，无评审按钮；文案与管理端一致 | P1 | UI | ● |
| SUP-08 | R13 | supervisor 无档案 | 任意 `/form/applications` | 403 `supervisor_not_registered` | P1 | API | ◐ |
| SUP-09 | R14 | 任意 | 备注超 1000 字 | 400 `validation_failed`；状态不变 | P2 | API | ◐ |
| SUP-10 | R17 | 六个可见状态各一条 | 列表与详情 | 文案与 §5 一致；学生端不可见的三个状态不出现于筛选下拉 | P1 | API/UI | ● |

### 6.6 报名名额（QTA）

| ID | 需求 | 前置 | 步骤 | 期望 | P | 层 | 覆盖 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| QTA-01 | R19 | 新建/种子导师 | 查看 `quota_capacity` 与 `/form/supervisors` | 默认 50；`remaining = capacity - used`；满额 `isFull=true` | P1 | API/DB | ◐ |
| QTA-02 | R19 | 导师余量 ≥1 | 学生 Submit 成功 | `quota_used +1`；`applications.quota_supervisor_id` = 导师 id | P0 | API/DB | ● |
| QTA-03 | R19 | `quota_used = capacity` | Submit | 409 `quota_full`；Draft 保持；其他导师不受影响 | P0 | API/DB | ● |
| QTA-04 | R19 | 容量 C，500 并发 Submit（可先以 50/100 验证） | 并发压测 | 成功数 = C；其余 409 `quota_full`；`quota_used = C`；无负数/超卖；无 5xx | P0 | API/DB | ● |
| QTA-05 | R19 | 已提交并占位 | Resubmit 且导师不变 | 不重复占用（`quota_used` 不变） | P0 | DB | ● |
| QTA-06 | R19 | `Returned`，先 Save 换导师再 Resubmit | Resubmit | 同一事务内释放旧导师、占用新导师；旧 -1、新 +1；二者要么都成功要么都回滚 | P0 | API/DB | ● |
| QTA-07 | R19 | 新导师已满 | Resubmit 换到满额导师 | 409 `quota_full`；整笔回滚：状态仍 `Returned`、旧导师仍占用 | P0 | API/DB | ○ |
| QTA-08 | R19 | Submit 后占位 | 导师 Reject | 释放 1 个名额；`quota_supervisor_id=NULL`；其他学生可再 Submit | P0 | API/DB | ○ |
| QTA-09 | R19 | `OfferSent` 占位 | 学生 Decline | 释放 1 个名额 | P0 | API/DB | ○ |
| QTA-10 | R19 | `OfferSent` 占位 | 学生 Accept | 名额保持占用（终态占用） | P1 | DB | ○ |
| QTA-11 | R19 | `Returned` 占位 | 停留在 Returned | 不释放，避免来回操作产生名额漏洞 | P1 | DB | ○ |
| QTA-12 | R19 | 两位导师 A/B | 并发 A→B 与 B→A 换导师 | 不死锁；最终 used 与 `quota_supervisor_id` 一致 | P2 | API/DB | ○ |
| QTA-13 | R19 | 直接 SQL 尝试 `quota_used > capacity` | 更新 | 被 `chk_supervisors_quota` 拒绝 | P2 | DB | ◐ |
| QTA-14 | R19 | 写方案文档 | 检查 500 并发方案说明 | 说明事务/行锁/原子更新/连接池/限流与失败重试；与实现一致 | P1 | 文档 | ○ |

### 6.7 批量 Send Offer（BAT）

| ID | 需求 | 前置 | 步骤 | 期望 | P | 层 | 覆盖 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| BAT-01 | R20 | N 条 `SupervisorRecommended` | `POST /form/offers/batch` | 全部成功；`successCount=N`、`failureCount=0`；每条独立事务提交 | P0 | API/DB | ● |
| BAT-02 | R20 | 合法 + 非法状态混合 | 批量 | 合法成功；非法失败并给出 `invalid_transition`；互不影响 | P0 | API/DB | ● |
| BAT-03 | R20 | 单条处理耗时 > 3s（注入延迟/锁等待） | 批量 | 该条 `code=timeout`；其余继续；响应不被整体拖死 | P0 | API | ○ |
| BAT-04 | R20 | 100 条混合 | 批量（并发 10） | 总耗时有界；DB 最终状态与 `failures` 一致；无重复流转 | P1 | API/DB | ○ |
| BAT-05 | R20 | 批量中途重复提交同批 | 再次批量 | 已转 `OfferSent` 的全部失败（`invalid_transition`），无二次副作用 | P1 | API/DB | ● |

### 6.8 表单配置化与校验（CFG）

| ID | 需求 | 前置 | 步骤 | 期望 | P | 层 | 覆盖 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| CFG-01 | R18 | 隔离库 | 向 `form_fields` 增加一个字段（映射到 `application_details` 已存在列，或 `storage_table=NULL` 的展示型字段），并补 `form_options` | `GET /form/schema` 出现；Save 可写、Submit 按 `is_required` 校验；无需改代码 | P0 | API/DB | ◐ |
| CFG-02 | R18 | 同上 | 将某 `form_sections.is_enabled=0` | 该节不出现在 schema；提交该节字段按未知字段拒绝；已存数据不丢 | P1 | API/DB | ◐ |
| CFG-03 | R18 | 同上 | 修改字段 `is_required` / `max_length` / 选项 | 前端必填星号、后端校验同步变化 | P1 | API | ◐ |
| CFG-04 | R18 | 同上 | `options_source=programs/exams/static` | 选项来自对应表；`supervisors_by_thrust` 走 `/form/supervisors` | P1 | API | ◐ |
| CFG-05 | R18 | 任意申请 | 详情读取 `email`；Save 时在 `values` 里传 `email` | 详情中的 `email` 由账号派生、不从 `application_details` 读取；请求体传 `email` 按未知字段拒绝（400 `unknown_field`） | P1 | API | ● |
| CFG-06 | R18 | 已有申请 | 重复小节提交 21 行 | 400 `validation_failed`，`too_many_rows` | P2 | API | ◐ |
| CFG-07 | R18 | 重复小节含全空行 | Save | 全空行被丢弃；`row_no` 连续重排 | P2 | DB | ◐ |
| CFG-08 | R23 | 任意端 | 检查申请表页面与 schema | 四个可选模块不渲染、不返回；向这些字段写值按未知字段拒绝 | P1 | API/UI | ● |
| CFG-09 | R18 | 迁移脚本 | 从空库执行 `npm run migrate` | 幂等可重复执行；参考数据/导师/窗口齐全；失败可回滚 | P0 | DB | ○ |

### 6.9 安全、并发与异常（SEC）

| ID | 需求 | 前置 | 步骤 | 期望 | P | 层 | 覆盖 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| SEC-01 | R15/R21 | Student 1 / Student 2 各有申请 | 1 读取/保存/提交 2 的申请 | 403 `not_resource_owner` 或 404；数据不变 | P0 | API | ● |
| SEC-02 | R13 | Supervisor A/B | A 访问 B 的申请（详情/评审） | 404 `not_found`；无法通过 ID 探测 | P0 | API | ● |
| SEC-03 | R21 | 未登录 | 猜测 ULID 访问详情 | 401，不返回任何业务字段 | P0 | API | ● |
| SEC-04 | R21 | 已登录 | 伪造 `Authorization: Bearer` / 篡改 role | 401；角色以库为准（每次请求读库） | P0 | API | ◐ |
| SEC-05 | R21 | Admin 禁用某账号后 | 该账号继续用旧 token | 401 `账号状态异常`（每次请求校验 status） | P1 | API | ○ |
| SEC-06 | — | 任意 | 检查登录响应/日志/错误体 | 不含明文密码、OTP、JWT、堆栈；5xx 只返回通用文案 | P0 | API/日志 | ◐ |
| SEC-07 | — | 任意 | 姓名/备注/退回原因写入 `<img src=x onerror=alert(1)>` | 页面按文本转义显示，不执行脚本 | P1 | UI | ○ |
| SEC-08 | — | Admin | `keyword` 传 `' OR 1=1 --` | 200 空结果或正常过滤；无 SQL 错误/5xx | P2 | API | ◐ |
| SEC-09 | R21 | 已登录 | 重复点击 Submit / 双击 Accept | 只有一次成功，其余 409；无重复审计/重复扣减 | P1 | API/UI | ○ |
| SEC-10 | R20 | 批量处理中刷新/关闭页面 | 重新进入列表 | 状态与 DB 一致；无「前端成功、后端失败」的假象 | P1 | UI/DB | ○ |

### 6.10 UI / 可用性（UI）

| ID | 需求 | 前置 | 步骤 | 期望 | P | 层 | 覆盖 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| UI-01 | R22 | — | 遍历三端页面 | 全英文；无中文文案/占位符；日期与姓名格式统一 | P1 | UI | ○ |
| UI-02 | R21 | 未登录 | 访问 `/applications`、`/admin/applications` | 跳 `/login?redirect=...`；登录后回到原页 | P1 | UI | ◐ |
| UI-03 | R15 | Student 已登录 | 访问 `/admin/applications` | 跳 `/403`；反向同理 | P1 | UI | ◐ |
| UI-04 | R03 | 无申请 | 打开 Application Status | Draft 占位行 + Application Form 按钮；无报错 | P1 | UI | ◐ |
| UI-05 | R03/R24 | 有申请 | 查看列表列 | 列与附件一致；**Due Date 按需求应不展示**（见 §9-01）；不出现折叠/展开控件 | P1 | UI | ○ |
| UI-06 | R04 | `OfferSent` | Accept/Decline 全流程 | 二次确认文案正确；成功 toast；状态即时更新；失败可恢复 | P0 | UI | ○ |
| UI-07 | R12 | 窗口未开始 / 已结束 | 打开申请表 | 顶部提示正确（可保存草稿 / 已关闭只读）；Submit 禁用；Save 按规则禁用 | P1 | UI | ◐ |
| UI-08 | R06 | Draft 缺必填 | 点 Submit | 前端就地标红并定位首个错误；不发请求或服务端返回后逐字段显示 | P1 | UI | ◐ |
| UI-09 | R05 | 已提交/终态 | 打开申请表 | 全字段只读并显示 Read-only；无 Save/Submit | P1 | UI | ◐ |
| UI-10 | R14 | 导师 `PendingSupervisorReview` | 列表与详情 Recommend/Reject | 弹窗备注可填可空；成功后行变只读并刷新文案 | P0 | UI | ○ |
| UI-11 | R11 | Admin 混合状态列表 | 勾选批量 | 只有 `SupervisorRecommended` 可勾选；全选只选可操作项；结果弹窗展示成功/失败数与原因 | P0 | UI | ◐ |
| UI-12 | — | 任意列表 | 空数据 / 接口 500 / 慢请求 | 有空态、错误重试、加载态；无 console error；无未处理 4xx/5xx | P1 | UI | ○ |
| UI-13 | — | 1280 / 768 视口 | 浏览三端列表与表单 | 无横向溢出遮挡关键操作；表格可横向滚动；按钮可点 | P2 | UI | ○ |
| UI-14 | — | 表单填写后未保存离开 | 切换路由/关页 | 有离开确认；取消可留在原页 | P2 | UI | ◐ |

---

## 7. 自动化现状与缺口

### 7.1 已有资产

| 资产 | 覆盖 | 备注 |
| --- | --- | --- |
| `server/test/unit/form/*` | 状态机、展示文案、校验、配置编译、名额逻辑、schema | 规则级，不连库 |
| `server/test/unit/user/*`、`middleware/*` | OTP、密码、会话、CSRF、Origin、鉴权 | 规则级 |
| `server/test/integration/app.test.ts` | 应用装配与基础路由 | 轻量集成 |
| `server/scripts/smoke.ts` | 认证主流程 | 需真实服务 |
| `server/scripts/smoke-form.ts` | 建单→提交→退回→重提→初筛→导师→批量 Offer→接受 + 负向 | 全链路；未挂 `npm script`，用 `npx tsx scripts/smoke-form.ts` |
| `server/scripts/smoke-quota.ts` | 并发占用/释放/迁移/不重复占用 | 直接压 DB 层 |
| `server/postman/*.json` | 认证 15 个请求、表单 37 个请求 | 手工/Newman 可跑 |
| `ui/test/**` | 组件、composable、guards、API client、常量 | 无浏览器 E2E |

### 7.2 主要缺口（建议补自动化）

1. **窗口三态**（未开始/进行中/已结束）对 Save/Submit/Resubmit 的组合——目前只能靠改库手工验证。
2. **名额释放链路**（Reject/Decline 释放、换导师失败回滚）——单测覆盖算法，缺少 API 级断言。
3. **批量 Offer 超时与部分失败**——需要可控延迟注入或 mock。
4. **浏览器 E2E**——二次确认、只读、批量勾选、错误定位目前无自动化。
5. **500 并发 Submit**——`smoke-quota.ts` 可调并发，但需独立的压测环境与结果留档。

---

## 8. 发布门禁（建议）

**必须全绿（P0）**

- AUTH-01/02/06/07/08/10/11/12/15
- STU-02/03/04/09/15/16/19/20/25/26/29
- SM-01/02/07
- ADM-03/04/05/06/08/09
- SUP-01/02/03/04/05/06
- QTA-02/03/04/05/06/07/08/09
- BAT-01/02/03
- CFG-01/09
- SEC-01/02/03
- UI-06/10/11

**可带风险发布（需 owner + 规避方案）**

- 仅影响体验的 P2：分页边界、长文本、768 视口、离开确认。
- 依赖环境的压测项：QTA-04/QTA-12/BAT-04，需说明测试规模与结论。

**退出标准**

- P0 用例 100% 执行且有证据（HTTP/DB/截图）。
- 无未关闭的 P0/P1 缺陷；P1 若有遗留须有明确规避与 owner。
- 冒烟脚本 + Postman 全流程在目标环境跑通。

---

## 9. 已知偏差与待确认（测试前必须定口径）

| 编号 | 现象 | 依据 | 影响 | 建议 |
| --- | --- | --- | --- | --- |
| 09-01 | 学生状态页仍渲染 Due Date 列（固定 `-`） | 需求 2.1.2 写「不展示 Due Date」；代码注释称「按本次确认保留」 | 验收口径冲突，可能被判不符 | 产品确认：删列或书面确认保留 |
| 09-02 | 学生端 `Returned` 显示 **Pending for Update**、`SupervisorRecommended` 显示 **Recommended** | 需求表写 **Need Update** / **Under Review**；代码按附件图对齐 | 文案验收不一致 | 以附件为准需书面确认，并同步更新需求表 |
| 09-03 | 声明勾选框（Declaration / Media consent）配置为非必填 | 需求要求「标星 `*` 字段必填」，需对照 `application-form.xlsx` | 若附件标星则漏校验 | 对照 xlsx 复核并调整 `form_fields.is_required` |
| 09-04 | 完全没有 `submission_windows` 记录时，Save/Submit 不受限制 | `form.config.service.ts` 的开发兜底 | 生产漏配配置会导致窗口失效 | 生产环境增加启动校验/告警；测试需明确「无窗口」用例是否可接受 |
| 09-05 | 学生也可用「密码登录」，导师/管理员也可用「验证码登录」 | `/user/logon` 支持两种 grant，未按角色限制 | 与「学生 OTP、员工密码」的表述不完全一致 | 确认是否为可接受扩展；否则按角色收口 |
| 09-06 | `smoke-form.ts` 未加入 `package.json` scripts | 仅有 `smoke`、`smoke:quota` | 回归入口不显眼，易漏跑 | 增加 `smoke:form` 脚本并在 README 标注 |
| 09-07 | 批量 Offer 单条超时 3s、并发 10 为硬编码 | `form.service.ts` | 无法按环境调优；超时用例难构造 | 抽成环境变量并补超时测试 |

---

## 10. 执行记录与缺陷

### 10.1 执行记录（回填）

| 用例 ID | 环境 | 执行人 | 日期 | 结果（Pass/Fail/Blocked） | 证据（请求/响应/DB/截图） | 缺陷 ID |
| --- | --- | --- | --- | --- | --- | --- |
|  |  |  |  |  |  |  |

### 10.2 缺陷模板

```markdown
### [P?] <一句话标题>
- 环境：<commit / 后端地址 / 浏览器>
- 前置：<账号、状态、窗口、名额>
- 步骤：
  1. ...
- 期望：
- 实际：
- 证据：<HTTP 状态与 body / SQL 结果 / 截图 / 日志>
- 影响：<角色 / 数据 / 是否可绕过>
- 备注：<必现/偶现、首次出现版本、相关用例 ID>
```

### 10.3 结果汇总（回填）

| 模块 | 用例数 | 通过 | 失败 | 阻塞 | 未执行 |
| --- | --- | --- | --- | --- | --- |
| AUTH | 16 |  |  |  |  |
| STU | 30 |  |  |  |  |
| SM | 10 |  |  |  |  |
| ADM | 12 |  |  |  |  |
| SUP | 10 |  |  |  |  |
| QTA | 14 |  |  |  |  |
| BAT | 5 |  |  |  |  |
| CFG | 9 |  |  |  |  |
| SEC | 10 |  |  |  |  |
| UI | 14 |  |  |  |  |
| **合计** | **130** |  |  |  |  |
