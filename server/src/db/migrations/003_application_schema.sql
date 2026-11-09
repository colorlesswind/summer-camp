-- =====================================================================
-- 003_application_schema.sql —— 申请表（Application Form）数据结构
--
-- 数据来源：附件/application-form.xlsx 的 Sheet1
--   A 列 Information Type  -> 小节（form_sections / 一张主表或子表）
--   B 列 Item               -> 字段（星号 = 必填 -> form_fields.is_required）
--   C 列 Fill-in Method     -> 控件类型（form_fields.widget）
--   D 列 Details            -> 单选选项（form_field_options / 各参考表）
--   E/F 列 Remarks/说明     -> 提示文案（form_fields.guide_text_en）
--
-- 约定（延续 001/002）
--   1. 主键统一 26 位 ULID（CHAR(26)）；supervisors.id 沿用 HR 源系统编号
--   2. 时间统一 DATETIME(3)，应用层一律 UTC；纯日期字段用 DATE
--   3. 枚举用 VARCHAR + CHECK，不用 ENUM：加值只改 CHECK，不重建表
--   4. 业务状态值（applications.status）与 form/application.state.ts 完全一致
--   5. 「保存草稿」语义：除结构性字段外一律可空，必填校验在 Submit 时按
--      form_fields.is_required 执行
--   6. 本文件不使用存储过程/触发器，可被 server/src/db/migrate.ts 按行尾
--      分号切分执行
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. 参考数据（表单提供什么选项，而不是学生填了什么）
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS programs (
  code            VARCHAR(8)   NOT NULL COMMENT 'AMAT | EOAS | MICS | SEE',
  dept_code       VARCHAR(16)  NOT NULL COMMENT '学院组织架构代码，如 D0010001',
  name_en         VARCHAR(128) NOT NULL COMMENT '表单展示名，如 PhD in Advanced Materials(AMAT)',
  thrust_name_en  VARCHAR(128) NOT NULL COMMENT '学域名，如 Thrust of Advanced Materials',
  thrust_name_zh  VARCHAR(64)  NULL,
  hub             VARCHAR(16)  NOT NULL DEFAULT 'FUNH',
  sort_order      SMALLINT     NOT NULL DEFAULT 0,
  is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at      DATETIME(3)  NOT NULL,
  updated_at      DATETIME(3)  NOT NULL,
  PRIMARY KEY (code),
  UNIQUE KEY uk_programs_dept_code (dept_code),
  KEY idx_programs_active_sort (is_active, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 导师。id 沿用源系统编号（附件 supervisor.xlsx），user_emp_id 为真实工号
CREATE TABLE IF NOT EXISTS supervisors (
  id             BIGINT UNSIGNED NOT NULL COMMENT '沿用源系统 id（360~448）',
  user_emp_id    VARCHAR(16)  NOT NULL COMMENT '工号，如 GZ0000180',
  name           VARCHAR(64)  NOT NULL COMMENT '英文名，如 Blake WANG',
  name_zh        VARCHAR(32)  NULL,
  email          VARCHAR(255) NOT NULL,
  hub            VARCHAR(16)  NOT NULL DEFAULT 'FUNH',
  thrust_code    VARCHAR(8)   NOT NULL COMMENT '所属 Thrust，决定该导师出现在哪些 Program 的选项里',
  dept_code      VARCHAR(16)  NOT NULL,
  dept_name_en   VARCHAR(128) NOT NULL,
  dept_name_zh   VARCHAR(64)  NULL,
  user_id        CHAR(26)     NULL COMMENT '导师登录账号 users.id；未开通登录时为 NULL',
  quota_capacity INT          NOT NULL DEFAULT 50 COMMENT '可选的「报名名额」(需求 2.1)：First Choice 占位上限',
  quota_used     INT          NOT NULL DEFAULT 0 COMMENT '已占用名额，靠原子 UPDATE 保证不超卖',
  is_active      BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at     DATETIME(3)  NOT NULL,
  updated_at     DATETIME(3)  NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_supervisors_emp_id (user_emp_id),
  UNIQUE KEY uk_supervisors_email (email),
  UNIQUE KEY uk_supervisors_user (user_id),
  -- 供 application_program_choices 的复合外键 (supervisor_id, program_code) 使用
  UNIQUE KEY uk_supervisors_id_thrust (id, thrust_code),
  KEY idx_supervisors_thrust_active (thrust_code, is_active, name),
  CONSTRAINT fk_supervisors_program FOREIGN KEY (thrust_code) REFERENCES programs (code),
  CONSTRAINT fk_supervisors_user FOREIGN KEY (user_id) REFERENCES users (id),
  CONSTRAINT chk_supervisors_quota CHECK (quota_capacity >= 0 AND quota_used >= 0 AND quota_used <= quota_capacity)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 上传文件元数据。文件本体进对象存储，库里只留相对 key
CREATE TABLE IF NOT EXISTS files (
  id            CHAR(26)        NOT NULL,
  storage_key   VARCHAR(512)    NOT NULL COMMENT '对象存储 key / 相对路径',
  original_name VARCHAR(255)    NOT NULL COMMENT '用户原始文件名，用于展示与下载',
  mime_type     VARCHAR(128)    NOT NULL,
  size_bytes    BIGINT UNSIGNED NOT NULL,
  sha256        CHAR(64)        NULL COMMENT '内容摘要，可用于秒传与去重',
  uploaded_by   CHAR(26)        NULL,
  created_at    DATETIME(3)     NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_files_storage_key (storage_key),
  KEY idx_files_sha256 (sha256),
  CONSTRAINT fk_files_uploader FOREIGN KEY (uploaded_by) REFERENCES users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 材料类型（Sheet1「Supporting Documents」的 8 行）。必填/份数/格式/大小都在这里配置
CREATE TABLE IF NOT EXISTS document_types (
  code           VARCHAR(32)  NOT NULL COMMENT 'IDENTITY_DOCUMENT | TRANSCRIPT | ...',
  label_en       VARCHAR(128) NOT NULL,
  label_zh       VARCHAR(64)  NULL,
  is_required    BOOLEAN      NOT NULL DEFAULT FALSE,
  max_files      SMALLINT     NOT NULL DEFAULT 1 COMMENT 'Transcript 允许上传多个',
  allowed_mime   VARCHAR(255) NOT NULL DEFAULT 'image/png,image/jpeg,application/pdf',
  max_size_bytes INT UNSIGNED NOT NULL DEFAULT 20971520 COMMENT '20 MB',
  sort_order     SMALLINT     NOT NULL DEFAULT 0,
  is_active      BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at     DATETIME(3)  NOT NULL,
  updated_at     DATETIME(3)  NOT NULL,
  PRIMARY KEY (code),
  CONSTRAINT chk_document_types_max_files CHECK (max_files >= 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 语言考试（Sheet1「English Language Proficiency」的 5 个 Examination）
CREATE TABLE IF NOT EXISTS exams (
  code       VARCHAR(16) NOT NULL COMMENT 'TOEFL_IBT | IELTS | GRE | CET4 | CET6',
  label_en   VARCHAR(64) NOT NULL,
  sort_order SMALLINT    NOT NULL DEFAULT 0,
  is_active  BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  PRIMARY KEY (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 某场考试的科目。GRE 没有听说读写，只有 Verbal/Quantitative/AW，
-- 科目集合由这张表约束，成绩子表再用复合外键引用
CREATE TABLE IF NOT EXISTS exam_subjects (
  exam_code  VARCHAR(16) NOT NULL,
  code       VARCHAR(32) NOT NULL COMMENT 'READING | LISTENING | SPEAKING | WRITING | TOTAL | GRE_VERBAL | ...',
  label_en   VARCHAR(64) NOT NULL,
  label_zh   VARCHAR(32) NULL,
  sort_order SMALLINT    NOT NULL DEFAULT 0,
  PRIMARY KEY (exam_code, code),
  CONSTRAINT fk_exam_subjects_exam FOREIGN KEY (exam_code) REFERENCES exams (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 声明条款。带版本号：同意的是「哪一版文字」必须可追溯
CREATE TABLE IF NOT EXISTS statement_definitions (
  code           VARCHAR(32) NOT NULL COMMENT 'DECLARATION | MEDIA_CONSENT',
  version        VARCHAR(16) NOT NULL,
  text_en        TEXT        NOT NULL,
  text_zh        TEXT        NULL,
  effective_from DATE        NOT NULL,
  is_active      BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at     DATETIME(3) NOT NULL,
  PRIMARY KEY (code, version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ---------------------------------------------------------------------
-- 2. 表单配置（Sheet1 的 A/B/C/D 四列，落成数据而不是代码）
--    加字段/改必填/换选项 = 改数据，不动 DDL、不动前端
-- ---------------------------------------------------------------------

-- 小节。payload_key 是该小节在 API values 里的键（可重复小节用数组）
CREATE TABLE IF NOT EXISTS form_sections (
  code          VARCHAR(32)  NOT NULL COMMENT 'PERSONAL_PARTICULARS | PROGRAM_CHOICE | ...',
  title_en      VARCHAR(128) NOT NULL,
  title_zh      VARCHAR(64)  NULL,
  payload_key   VARCHAR(32)  NULL COMMENT '可重复小节的数组键，如 publications',
  is_repeatable BOOLEAN      NOT NULL DEFAULT FALSE COMMENT '可新增多行（论文/经历）',
  is_enabled    BOOLEAN      NOT NULL DEFAULT TRUE COMMENT '笔试题允许先不实现的模块置 0',
  sort_order    SMALLINT     NOT NULL DEFAULT 0,
  created_at    DATETIME(3)  NOT NULL,
  updated_at    DATETIME(3)  NOT NULL,
  PRIMARY KEY (code),
  KEY idx_form_sections_sort (is_enabled, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 字段。code 就是 API 里的 values 键；storage_* 指向真正落库的位置
CREATE TABLE IF NOT EXISTS form_fields (
  code             VARCHAR(64)  NOT NULL,
  section_code     VARCHAR(32)  NOT NULL,
  group_code       VARCHAR(32)  NULL COMMENT '同一行内的多个控件，如 idDocument / phone',
  label_en         VARCHAR(255) NOT NULL,
  label_zh         VARCHAR(128) NULL,
  widget           VARCHAR(32)  NOT NULL COMMENT 'Sheet1 C 列',
  value_type       VARCHAR(16)  NOT NULL DEFAULT 'string' COMMENT 'string | number | boolean | date',
  is_required      BOOLEAN      NOT NULL DEFAULT FALSE COMMENT 'Sheet1 B 列的星号',
  max_length       INT          NULL,
  options_source   VARCHAR(32)  NULL COMMENT 'static | programs | supervisors_by_thrust | exams',
  depends_on_field VARCHAR(64)  NULL COMMENT '该字段有值时才要求本字段（并限制选项范围）',
  guide_text_en    TEXT         NULL COMMENT 'Sheet1 E/F 列的提示与填写前说明',
  storage_table    VARCHAR(64)  NULL,
  storage_column   VARCHAR(64)  NULL,
  sort_order       SMALLINT     NOT NULL DEFAULT 0,
  is_enabled       BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at       DATETIME(3)  NOT NULL,
  updated_at       DATETIME(3)  NOT NULL,
  PRIMARY KEY (code),
  KEY idx_form_fields_section_sort (section_code, sort_order),
  KEY idx_form_fields_depends (depends_on_field),
  CONSTRAINT fk_form_fields_section FOREIGN KEY (section_code) REFERENCES form_sections (code),
  CONSTRAINT chk_form_fields_widget CHECK (widget IN (
    'free_text', 'long_text', 'number', 'date', 'date_range', 'single_choice',
    'single_choice_with_text', 'upload', 'url', 'checkbox', 'fixed_value', 'readonly'
  )),
  CONSTRAINT chk_form_fields_value_type CHECK (value_type IN ('string', 'number', 'boolean', 'date'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 单选选项。options_source='static' 时从这里取
CREATE TABLE IF NOT EXISTS form_field_options (
  field_code VARCHAR(64)  NOT NULL,
  value      VARCHAR(64)  NOT NULL COMMENT '入库值（业务码），不是展示文案',
  label_en   VARCHAR(255) NOT NULL,
  label_zh   VARCHAR(128) NULL,
  sort_order SMALLINT     NOT NULL DEFAULT 0,
  is_active  BOOLEAN      NOT NULL DEFAULT TRUE,
  PRIMARY KEY (field_code, value),
  CONSTRAINT fk_form_field_options_field FOREIGN KEY (field_code) REFERENCES form_fields (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 提交时间段（需求 2.1 的「数据库预设开始/结束时间」）。
-- 多条即为多个窗口，submit 只要求落在任一窗口内
CREATE TABLE IF NOT EXISTS submission_windows (
  id         CHAR(26)    NOT NULL,
  label      VARCHAR(64) NULL,
  opens_at   DATETIME(3) NOT NULL,
  closes_at  DATETIME(3) NOT NULL,
  is_active  BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  KEY idx_submission_windows_open (is_active, opens_at, closes_at),
  CONSTRAINT chk_submission_windows_range CHECK (closes_at > opens_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ---------------------------------------------------------------------
-- 3. 申请单主体
-- ---------------------------------------------------------------------

-- Application No. 发号器。单独一张自增表，避免 MAX(number)+1 造成的并发重号
CREATE TABLE IF NOT EXISTS application_number_seq (
  id        BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  issued_at DATETIME(3)     NOT NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 申请单。只放「工作流 + 列表页」需要的字段，表单内容在 application_details
CREATE TABLE IF NOT EXISTS applications (
  id                     CHAR(26)        NOT NULL,
  application_number     VARCHAR(20)     NOT NULL COMMENT '系统生成，如 26000000001',
  user_id                CHAR(26)        NOT NULL COMMENT '申请人账号；同一登录邮箱只有一份申请',
  status                 VARCHAR(32)     NOT NULL DEFAULT 'Draft',
  reviewer_supervisor_id BIGINT UNSIGNED NULL COMMENT '负责评审的导师 = First Choice 导师',
  submitted_at           DATETIME(3)     NULL COMMENT '最近一次 Submit/Resubmit 的时间',
  status_changed_at      DATETIME(3)     NOT NULL COMMENT '列表页 Time 列',
  return_reason          VARCHAR(1000)   NULL COMMENT '最近一次 Return 的原因',
  created_at             DATETIME(3)     NOT NULL,
  updated_at             DATETIME(3)     NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_applications_number (application_number),
  UNIQUE KEY uk_applications_user (user_id),
  KEY idx_applications_status_time (status, status_changed_at),
  KEY idx_applications_time (status_changed_at),
  KEY idx_applications_reviewer (reviewer_supervisor_id, status),
  CONSTRAINT fk_applications_user FOREIGN KEY (user_id) REFERENCES users (id),
  CONSTRAINT fk_applications_reviewer FOREIGN KEY (reviewer_supervisor_id) REFERENCES supervisors (id),
  CONSTRAINT chk_applications_status CHECK (status IN (
    'Draft',
    'PendingForPreliminaryScreening',
    'Returned',
    'PendingSupervisorReview',
    'SupervisorRecommended',
    'SupervisorRejected',
    'OfferSent',
    'OfferAccepted',
    'OfferDeclined'
  ))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ---------------------------------------------------------------------
-- 4. 1:1 小节：Personal Particulars / 研究方向 / Personal Statement
--    与 applications 分开，列表页只扫窄表，详情页再 join
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS application_details (
  application_id         CHAR(26)     NOT NULL,

  last_name_en           VARCHAR(64)  NULL COMMENT '全大写拼音姓，如 ZHANG',
  first_name_en          VARCHAR(64)  NULL COMMENT '如 San',
  full_name_zh           VARCHAR(64)  NULL,
  gender                 VARCHAR(8)   NULL COMMENT 'MALE | FEMALE',
  date_of_birth          DATE         NULL,
  id_document_type       VARCHAR(32)  NULL COMMENT 'RESIDENT_ID | HOME_RETURN_PERMIT | PASSPORT',
  id_document_number     VARCHAR(64)  NULL,
  needs_student_visa     BOOLEAN      NULL,
  correspondence_address VARCHAR(512) NULL,
  phone_country_code     VARCHAR(8)   NULL COMMENT '如 +86',
  phone_number           VARCHAR(32)  NULL,
  phone_e164             VARCHAR(48)  GENERATED ALWAYS AS (
    CASE
      WHEN phone_country_code IS NULL OR phone_number IS NULL THEN NULL
      ELSE CONCAT(phone_country_code, phone_number)
    END
  ) STORED COMMENT '规范化后的完整号码',

  proposed_research_areas TEXT        NULL,
  personal_statement      MEDIUMTEXT  NULL,

  -- 兜底扩展位：配置层新加、还不值得建列的字段先放这里
  extra_data              JSON        NULL,
  created_at              DATETIME(3) NOT NULL,
  updated_at              DATETIME(3) NOT NULL,
  PRIMARY KEY (application_id),
  KEY idx_application_details_name (last_name_en, first_name_en),
  CONSTRAINT fk_application_details_application FOREIGN KEY (application_id) REFERENCES applications (id) ON DELETE CASCADE,
  CONSTRAINT chk_application_details_gender CHECK (gender IN ('MALE', 'FEMALE')),
  CONSTRAINT chk_application_details_id_doc CHECK (id_document_type IN (
    'RESIDENT_ID', 'HOME_RETURN_PERMIT', 'PASSPORT'
  )),
  CONSTRAINT chk_application_details_dob CHECK (date_of_birth IS NULL OR date_of_birth >= '1900-01-01')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ---------------------------------------------------------------------
-- 5. 志愿：Program Choice（最多两个志愿，序号 1/2）
--      (application_id, choice_rank)   -> 每个志愿槽只有一条
--      (application_id, program_code)  -> 两个志愿不能是同一个 Program
--      (application_id, supervisor_id) -> 两个志愿不能是同一位导师
--    复合外键 (supervisor_id, program_code) -> supervisors(id, thrust_code)
--      保证「导师必须属于所选 Program」
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS application_program_choices (
  id             CHAR(26)        NOT NULL,
  application_id CHAR(26)        NOT NULL,
  choice_rank    TINYINT         NOT NULL COMMENT '1 = First Choice，2 = Second Choice',
  program_code   VARCHAR(8)      NOT NULL,
  supervisor_id  BIGINT UNSIGNED NULL COMMENT '第二志愿未选导师时为 NULL',
  created_at     DATETIME(3)     NOT NULL,
  updated_at     DATETIME(3)     NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_program_choices_rank (application_id, choice_rank),
  UNIQUE KEY uk_program_choices_program (application_id, program_code),
  UNIQUE KEY uk_program_choices_supervisor (application_id, supervisor_id),
  KEY idx_program_choices_supervisor (supervisor_id),
  KEY idx_program_choices_supervisor_program (supervisor_id, program_code),
  CONSTRAINT fk_program_choices_application FOREIGN KEY (application_id) REFERENCES applications (id) ON DELETE CASCADE,
  CONSTRAINT fk_program_choices_program FOREIGN KEY (program_code) REFERENCES programs (code),
  CONSTRAINT fk_program_choices_supervisor FOREIGN KEY (supervisor_id, program_code)
    REFERENCES supervisors (id, thrust_code),
  CONSTRAINT chk_program_choices_rank CHECK (choice_rank IN (1, 2))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ---------------------------------------------------------------------
-- 6. 可重复小节（1:N）。row_no 是展示顺序，UI 增删行时整体重排
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS application_educations (
  id                     CHAR(26)      NOT NULL,
  application_id         CHAR(26)      NOT NULL,
  row_no                 SMALLINT      NOT NULL,
  level_of_study         VARCHAR(16)   NULL COMMENT 'UNDERGRADUATE | POSTGRADUATE | OTHER',
  level_of_study_other   VARCHAR(64)   NULL,
  awarding_institution   VARCHAR(255)  NULL,
  country_region         VARCHAR(128)  NULL,
  title_of_award         VARCHAR(255)  NULL,
  major_areas            VARCHAR(255)  NULL,
  minor_areas            VARCHAR(255)  NULL,
  program_duration_years DECIMAL(4,1)  NULL COMMENT '单位：年',
  commencement_date      DATE          NULL,
  completion_date        DATE          NULL,
  gpa_value              DECIMAL(6,2)  NULL COMMENT 'Latest Overall GPA 的左边',
  gpa_scale              DECIMAL(6,2)  NULL COMMENT '右边，如 4.0 / 100',
  class_rank             INT           NULL,
  class_size             INT           NULL,
  created_at             DATETIME(3)   NOT NULL,
  updated_at             DATETIME(3)   NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_educations_row (application_id, row_no),
  CONSTRAINT fk_educations_application FOREIGN KEY (application_id) REFERENCES applications (id) ON DELETE CASCADE,
  CONSTRAINT chk_educations_level CHECK (level_of_study IN ('UNDERGRADUATE', 'POSTGRADUATE', 'OTHER')),
  CONSTRAINT chk_educations_duration CHECK (program_duration_years IS NULL OR program_duration_years > 0),
  CONSTRAINT chk_educations_gpa CHECK (
    gpa_value IS NULL OR gpa_scale IS NULL OR (gpa_value >= 0 AND gpa_scale > 0 AND gpa_value <= gpa_scale)
  ),
  CONSTRAINT chk_educations_rank CHECK (
    class_rank IS NULL OR class_size IS NULL OR (class_rank > 0 AND class_size > 0 AND class_rank <= class_size)
  ),
  CONSTRAINT chk_educations_dates CHECK (
    commencement_date IS NULL OR completion_date IS NULL OR completion_date >= commencement_date
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS application_awards (
  id             CHAR(26)     NOT NULL,
  application_id CHAR(26)     NOT NULL,
  row_no         SMALLINT     NOT NULL,
  level_of_award VARCHAR(128) NULL,
  award_name     VARCHAR(255) NULL,
  awarding_body  VARCHAR(255) NULL,
  award_date     DATE         NULL,
  created_at     DATETIME(3)  NOT NULL,
  updated_at     DATETIME(3)  NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_awards_row (application_id, row_no),
  CONSTRAINT fk_awards_application FOREIGN KEY (application_id) REFERENCES applications (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS application_publications (
  id                 CHAR(26)     NOT NULL,
  application_id     CHAR(26)     NOT NULL,
  row_no             SMALLINT     NOT NULL,
  title              VARCHAR(512) NULL,
  venue              VARCHAR(255) NULL COMMENT 'Journal / Conference Name / Publisher',
  authors            VARCHAR(512) NULL,
  publish_date       DATE         NULL,
  publication_status VARCHAR(32)  NULL,
  url                VARCHAR(512) NULL,
  created_at         DATETIME(3)  NOT NULL,
  updated_at         DATETIME(3)  NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_publications_row (application_id, row_no),
  CONSTRAINT fk_publications_application FOREIGN KEY (application_id) REFERENCES applications (id) ON DELETE CASCADE,
  CONSTRAINT chk_publications_status CHECK (publication_status IN (
    'IN_PREPARATION', 'UNDER_REVIEW', 'REVISIONS_REQUIRED', 'ACCEPTED', 'PUBLISHED'
  ))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS application_experiences (
  id               CHAR(26)     NOT NULL,
  application_id   CHAR(26)     NOT NULL,
  row_no           SMALLINT     NOT NULL,
  experience_type  VARCHAR(16)  NULL,
  organization     VARCHAR(255) NULL,
  position         VARCHAR(255) NULL,
  period_start     DATE         NULL,
  period_end       DATE         NULL,
  responsibilities TEXT         NULL,
  created_at       DATETIME(3)  NOT NULL,
  updated_at       DATETIME(3)  NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_experiences_row (application_id, row_no),
  CONSTRAINT fk_experiences_application FOREIGN KEY (application_id) REFERENCES applications (id) ON DELETE CASCADE,
  CONSTRAINT chk_experiences_type CHECK (experience_type IN (
    'WORK', 'INTERNSHIP', 'TRAINING', 'VOLUNTEER', 'EXTRACURRICULAR'
  )),
  CONSTRAINT chk_experiences_period CHECK (
    period_start IS NULL OR period_end IS NULL OR period_end >= period_start
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS application_documents (
  id             CHAR(26)    NOT NULL,
  application_id CHAR(26)    NOT NULL,
  doc_type       VARCHAR(32) NOT NULL,
  file_id        CHAR(26)    NOT NULL,
  uploaded_at    DATETIME(3) NOT NULL,
  created_at     DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_documents_file (application_id, file_id),
  KEY idx_documents_type (application_id, doc_type),
  CONSTRAINT fk_documents_application FOREIGN KEY (application_id) REFERENCES applications (id) ON DELETE CASCADE,
  CONSTRAINT fk_documents_type FOREIGN KEY (doc_type) REFERENCES document_types (code),
  CONSTRAINT fk_documents_file FOREIGN KEY (file_id) REFERENCES files (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS application_english_tests (
  id              CHAR(26)    NOT NULL,
  application_id  CHAR(26)    NOT NULL,
  exam_code       VARCHAR(16) NOT NULL,
  test_date       DATE        NULL,
  registration_no VARCHAR(64) NULL,
  created_at      DATETIME(3) NOT NULL,
  updated_at      DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_english_tests_exam (application_id, exam_code),
  UNIQUE KEY uk_english_tests_id_exam (id, exam_code),
  CONSTRAINT fk_english_tests_application FOREIGN KEY (application_id) REFERENCES applications (id) ON DELETE CASCADE,
  CONSTRAINT fk_english_tests_exam FOREIGN KEY (exam_code) REFERENCES exams (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 分科目成绩。两条复合外键把「科目必须属于该考试」写进数据库
CREATE TABLE IF NOT EXISTS application_english_test_scores (
  test_id      CHAR(26)    NOT NULL,
  exam_code    VARCHAR(16) NOT NULL,
  subject_code VARCHAR(32) NOT NULL,
  score        VARCHAR(32) NULL COMMENT '原始为自由文本：6.5 / V158 / N/A',
  created_at   DATETIME(3) NOT NULL,
  updated_at   DATETIME(3) NOT NULL,
  PRIMARY KEY (test_id, subject_code),
  KEY idx_english_scores_subject (exam_code, subject_code),
  CONSTRAINT fk_english_scores_test FOREIGN KEY (test_id, exam_code)
    REFERENCES application_english_tests (id, exam_code) ON DELETE CASCADE,
  CONSTRAINT fk_english_scores_subject FOREIGN KEY (exam_code, subject_code)
    REFERENCES exam_subjects (exam_code, code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Statement：勾选框。记录「同意的哪一版条款」
CREATE TABLE IF NOT EXISTS application_consents (
  application_id    CHAR(26)    NOT NULL,
  statement_code    VARCHAR(32) NOT NULL,
  statement_version VARCHAR(16) NOT NULL,
  agreed            BOOLEAN     NOT NULL DEFAULT FALSE,
  agreed_at         DATETIME(3) NULL,
  created_at        DATETIME(3) NOT NULL,
  updated_at        DATETIME(3) NOT NULL,
  PRIMARY KEY (application_id, statement_code),
  CONSTRAINT fk_consents_application FOREIGN KEY (application_id) REFERENCES applications (id) ON DELETE CASCADE,
  CONSTRAINT fk_consents_statement FOREIGN KEY (statement_code, statement_version)
    REFERENCES statement_definitions (code, version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ---------------------------------------------------------------------
-- 7. 状态流转审计。动作名与 form/application.state.ts 的 ApplicationAction 一致
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS application_status_logs (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  application_id CHAR(26)        NOT NULL,
  from_status    VARCHAR(32)     NULL COMMENT '首次创建时为 NULL',
  to_status      VARCHAR(32)     NOT NULL,
  action         VARCHAR(32)     NOT NULL,
  actor_user_id  CHAR(26)        NULL,
  actor_role     VARCHAR(16)     NULL COMMENT 'student | admin | supervisor',
  remark         VARCHAR(1000)   NULL,
  created_at     DATETIME(3)     NOT NULL,
  PRIMARY KEY (id),
  KEY idx_status_logs_application (application_id, created_at),
  KEY idx_status_logs_to_status (to_status, created_at),
  CONSTRAINT fk_status_logs_application FOREIGN KEY (application_id) REFERENCES applications (id) ON DELETE CASCADE,
  CONSTRAINT fk_status_logs_actor FOREIGN KEY (actor_user_id) REFERENCES users (id),
  CONSTRAINT chk_status_logs_action CHECK (action IN (
    'save', 'submit', 'resubmit', 'return', 'approve', 'recommend', 'reject',
    'send_offer', 'accept_offer', 'decline_offer'
  ))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ---------------------------------------------------------------------
-- 8. 列表页视图：三端列表共用一次查询
-- ---------------------------------------------------------------------

CREATE OR REPLACE VIEW v_application_list AS
SELECT
  a.id               AS application_id,
  a.application_number,
  a.status,
  a.status_changed_at,
  a.return_reason,
  a.reviewer_supervisor_id,
  u.primary_email    AS email,
  CASE
    WHEN d.last_name_en IS NULL AND d.first_name_en IS NULL THEN NULL
    WHEN d.first_name_en IS NULL THEN d.last_name_en
    WHEN d.last_name_en IS NULL THEN d.first_name_en
    ELSE CONCAT(d.last_name_en, ', ', d.first_name_en)
  END                AS name_en,
  d.full_name_zh,
  c1.program_code    AS first_program_code,
  s1.name            AS first_supervisor_name,
  c2.program_code    AS second_program_code,
  s2.name            AS second_supervisor_name
FROM applications a
JOIN users u ON u.id = a.user_id
LEFT JOIN application_details d ON d.application_id = a.id
LEFT JOIN application_program_choices c1 ON c1.application_id = a.id AND c1.choice_rank = 1
LEFT JOIN supervisors s1 ON s1.id = c1.supervisor_id
LEFT JOIN application_program_choices c2 ON c2.application_id = a.id AND c2.choice_rank = 2
LEFT JOIN supervisors s2 ON s2.id = c2.supervisor_id;
