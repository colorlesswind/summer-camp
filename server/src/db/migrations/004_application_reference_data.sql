-- =====================================================================
-- 004_application_reference_data.sql —— 申请表的参考数据与表单配置种子
--
-- 全部来自 附件/application-form.xlsx（Sheet1）与 附件/supervisor.xlsx：
--   programs          <- Sheet1「Program Choice」的 4 个 option 值
--   document_types    <- Sheet1「Supporting Documents」的 8 行
--   exams/exam_subjects<- Sheet1「English Language Proficiency」的 5 场考试与科目
--   statement_definitions <- Sheet1「Statement」的两段条款原文（带版本号）
--   form_sections/form_fields/form_field_options <- Sheet1 的 A/B/C/D 四列
--
-- 全部使用 INSERT IGNORE，可重复执行。
--
-- 说明：Education / Awards / Supporting Documents / English Proficiency 四节
-- 按题目要求「可先不实现」，这里只建小节并置 is_enabled = 0；等真正实现时把
-- is_enabled 改 1，并补上对应的 storage 写入逻辑即可。
-- =====================================================================


-- ---------- 专业（Thrust）---------- 

INSERT IGNORE INTO programs
  (code, dept_code, name_en, thrust_name_en, thrust_name_zh, hub, sort_order, is_active, created_at, updated_at)
VALUES
  ('AMAT', 'D0010001', 'PhD in Advanced Materials(AMAT)', 'Thrust of Advanced Materials', '先进材料学域', 'FUNH', 10, TRUE, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)),
  ('EOAS', 'D0020001', 'PhD in Earth, Ocean and Atmospheric Sciences(EOAS)', 'Thrust of Earth, Ocean and Atmospheric Sciences', '地球与海洋大气科学学域', 'FUNH', 20, TRUE, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)),
  ('MICS', 'D0030001', 'PhD in Microelectronics(MICS)', 'Thrust of Microelectronics', '微电子学域', 'FUNH', 30, TRUE, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)),
  ('SEE', 'D0040001', 'PhD in Sustainable Energy and Environment(SEE)', 'Thrust of Sustainable Energy and Environment', '可持续能源与环境学域', 'FUNH', 40, TRUE, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3));


-- ---------- 证明材料类型（8 类）---------- 

INSERT IGNORE INTO document_types
  (code, label_en, label_zh, is_required, max_files, allowed_mime, max_size_bytes, sort_order, is_active, created_at, updated_at)
VALUES
  ('IDENTITY_DOCUMENT', 'Identity Document', '身份证明', TRUE, 1, 'image/png,image/jpeg,application/pdf', 20971520, 10, TRUE, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)),
  ('TRANSCRIPT', 'Latest Transcript(s)', '最新成绩单', TRUE, 5, 'image/png,image/jpeg,application/pdf', 20971520, 20, TRUE, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)),
  ('ENGLISH_PROFICIENCY', 'Proof of English Proficiency', '英语能力证明', FALSE, 1, 'image/png,image/jpeg,application/pdf', 20971520, 30, TRUE, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)),
  ('ACADEMIC_CV', 'Academic CV', '学术简历', TRUE, 1, 'image/png,image/jpeg,application/pdf', 20971520, 40, TRUE, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)),
  ('ENROLLMENT_CERTIFICATE', 'Enrollment Certificate/Degree Certificate(s)', '在读证明/学位证书', TRUE, 2, 'image/png,image/jpeg,application/pdf', 20971520, 50, TRUE, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)),
  ('RANKING_PROOF', 'Proof of Ranking', '排名证明', FALSE, 1, 'image/png,image/jpeg,application/pdf', 20971520, 60, TRUE, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)),
  ('RESEARCH_PROPOSAL', 'Research Proposal', '研究计划书', FALSE, 1, 'image/png,image/jpeg,application/pdf', 20971520, 70, TRUE, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)),
  ('OTHER', 'Other Documents', '其他材料', FALSE, 5, 'image/png,image/jpeg,application/pdf', 20971520, 80, TRUE, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3));


-- ---------- 语言考试与科目 ---------- 

INSERT IGNORE INTO exams (code, label_en, sort_order, is_active, created_at, updated_at)
VALUES
  ('TOEFL_IBT', 'TOEFL-Internet Based', 10, TRUE, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)),
  ('IELTS', 'IELTS', 20, TRUE, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)),
  ('GRE', 'GRE', 30, TRUE, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)),
  ('CET4', 'CET 4', 40, TRUE, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)),
  ('CET6', 'CET 6', 50, TRUE, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3));

INSERT IGNORE INTO exam_subjects (exam_code, code, label_en, label_zh, sort_order)
VALUES
  ('TOEFL_IBT', 'READING', 'Reading', '阅读', 10),
  ('TOEFL_IBT', 'LISTENING', 'Listening', '听力', 20),
  ('TOEFL_IBT', 'SPEAKING', 'Speaking', '口语', 30),
  ('TOEFL_IBT', 'WRITING', 'Writing', '写作', 40),
  ('TOEFL_IBT', 'TOTAL', 'Total Score', '总分', 50),
  ('IELTS', 'READING', 'Reading', '阅读', 10),
  ('IELTS', 'LISTENING', 'Listening', '听力', 20),
  ('IELTS', 'SPEAKING', 'Speaking', '口语', 30),
  ('IELTS', 'WRITING', 'Writing', '写作', 40),
  ('IELTS', 'TOTAL', 'Total Score', '总分', 50),
  ('GRE', 'GRE_VERBAL', 'General Test: Verbal', '语文', 10),
  ('GRE', 'GRE_QUANTITATIVE', 'Quantitative', '数学', 20),
  ('GRE', 'GRE_ANALYTICAL_WRITING', 'Analytical Writing', '分析性写作', 30),
  ('CET4', 'CET4', 'CET4', 'CET4', 10),
  ('CET6', 'CET6', 'CET6', 'CET6', 10);


-- ---------- 声明条款（原文来自 Sheet1 的 D112 / D113）---------- 

INSERT IGNORE INTO statement_definitions
  (code, version, text_en, text_zh, effective_from, is_active, created_at)
VALUES
  ('DECLARATION', 'v1',
   'I declare that the information provided in support of this application is true, accurate, and complete to the best of my knowledge. I understand that this information will be used for the admission assessment of the Function Hub Summer Camp for PhD Admission. I consent to HKUST(GZ) Function Hub collecting and processing my personal data for purposes related to the administration, evaluation, and selection of this Summer Camp.',
   NULL, '2026-01-01', TRUE, UTC_TIMESTAMP(3)),
  ('MEDIA_CONSENT', 'v1',
   'I acknowledge that photos and/or videos may be taken during the Function Hub Summer Camp and consent to their use by the HKUST(GZ) Function Hub and The Hong Kong University of Science and Technology (Guangzhou) for official and promotional purposes.',
   NULL, '2026-01-01', TRUE, UTC_TIMESTAMP(3));


-- ---------- 提交时间段（运维按招生计划调整；多条即为多个窗口）---------- 

INSERT IGNORE INTO submission_windows
  (id, label, opens_at, closes_at, is_active, created_at, updated_at)
VALUES
  ('01JQ0000000000000000000001', 'Summer Camp 2026 application', '2026-11-01 00:00:00.000', '2026-12-31 15:59:59.000', TRUE, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3));


-- ---------- 表单小节（Sheet1 A 列）---------- 

INSERT IGNORE INTO form_sections
  (code, title_en, title_zh, payload_key, is_repeatable, is_enabled, sort_order, created_at, updated_at)
VALUES
  ('PERSONAL_PARTICULARS', 'Personal Particulars', '个人信息', NULL, FALSE, TRUE, 10, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)),
  ('PROGRAM_CHOICE', 'Program Choice', '专业志愿', NULL, FALSE, TRUE, 20, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)),
  ('PERSONAL_STATEMENT', 'Personal Statement', '个人陈述', NULL, FALSE, TRUE, 30, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)),
  ('EDUCATION', 'Applicant''s Educational Background', '教育背景', 'educations', TRUE, FALSE, 40, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)),
  ('AWARDS', 'Awards and Professional Qualifications', '奖项与专业资格', 'awards', TRUE, FALSE, 50, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)),
  ('PUBLICATIONS', 'Publications', '发表论文', 'publications', TRUE, TRUE, 60, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)),
  ('WORK_EXPERIENCE', 'Work Experience / Internship / Training / Volunteer work / Extracurricular Activities', '工作与课外经历', 'experiences', TRUE, TRUE, 70, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)),
  ('SUPPORTING_DOCUMENTS', 'Supporting Documents', '证明材料', 'documents', TRUE, FALSE, 80, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)),
  ('ENGLISH_PROFICIENCY', 'English Language Proficiency', '英语语言能力', 'englishTests', TRUE, FALSE, 90, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)),
  ('STATEMENT', 'Statement', '声明', NULL, FALSE, TRUE, 100, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3));


-- ---------- 表单字段（Sheet1 B/C 列，code 即 API 的 values 键）---------- 

INSERT IGNORE INTO form_fields
  (code, section_code, group_code, label_en, label_zh, widget, value_type, is_required, max_length,
   options_source, depends_on_field, guide_text_en, storage_table, storage_column, sort_order, is_enabled,
   created_at, updated_at)
VALUES
  ('lastNameEn', 'PERSONAL_PARTICULARS', 'nameEn', 'Last Name (in English)', '姓', 'free_text', 'string', TRUE, 64,
   NULL, NULL, 'In capitals, last name first. Example: ZHANG, San', 'application_details', 'last_name_en', 10, TRUE,
   UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)),
  ('firstNameEn', 'PERSONAL_PARTICULARS', 'nameEn', 'First Name (in English)', '名', 'free_text', 'string', TRUE, 64,
   NULL, NULL, NULL, 'application_details', 'first_name_en', 20, TRUE,
   UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)),
  ('fullNameZh', 'PERSONAL_PARTICULARS', NULL, 'Full Name in Chinese', '中文姓名', 'free_text', 'string', TRUE, 64,
   NULL, NULL, 'Example: 张三', 'application_details', 'full_name_zh', 30, TRUE,
   UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)),
  ('gender', 'PERSONAL_PARTICULARS', NULL, 'Gender', '性别', 'single_choice', 'string', TRUE, NULL,
   'static', NULL, NULL, 'application_details', 'gender', 40, TRUE,
   UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)),
  ('dateOfBirth', 'PERSONAL_PARTICULARS', NULL, 'Date of Birth', '出生日期', 'date', 'date', TRUE, NULL,
   NULL, NULL, 'Format: yyyy-mm-dd', 'application_details', 'date_of_birth', 50, TRUE,
   UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)),
  ('idDocumentType', 'PERSONAL_PARTICULARS', 'idDocument', 'I.D. Document Type', '证件类型', 'single_choice', 'string', TRUE, NULL,
   'static', NULL, 'Select the document type, then fill in the number.', 'application_details', 'id_document_type', 60, TRUE,
   UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)),
  ('idDocumentNumber', 'PERSONAL_PARTICULARS', 'idDocument', 'I.D. Document Number', '证件号码', 'free_text', 'string', TRUE, 64,
   NULL, NULL, NULL, 'application_details', 'id_document_number', 70, TRUE,
   UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)),
  ('needsStudentVisa', 'PERSONAL_PARTICULARS', NULL, 'Need for student visa / entry permit', '是否需要学生签证/入境许可', 'single_choice', 'boolean', TRUE, NULL,
   'static', NULL, 'Do you need a student visa or entry permit to study in Mainland?', 'application_details', 'needs_student_visa', 80, TRUE,
   UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)),
  ('correspondenceAddress', 'PERSONAL_PARTICULARS', NULL, 'Correspondence Address', '通讯地址', 'free_text', 'string', FALSE, 512,
   NULL, NULL, NULL, 'application_details', 'correspondence_address', 90, TRUE,
   UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)),
  ('phoneCountryCode', 'PERSONAL_PARTICULARS', 'phone', 'Country Code', '国家/地区代码', 'single_choice', 'string', TRUE, 8,
   'static', NULL, 'Calling code of your phone number; +86 is on top.', 'application_details', 'phone_country_code', 100, TRUE,
   UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)),
  ('phoneNumber', 'PERSONAL_PARTICULARS', 'phone', 'Phone Number', '电话号码', 'free_text', 'string', TRUE, 32,
   NULL, NULL, NULL, 'application_details', 'phone_number', 110, TRUE,
   UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)),
  ('email', 'PERSONAL_PARTICULARS', NULL, 'Email Address', '邮箱', 'readonly', 'string', TRUE, 255,
   NULL, NULL, 'Taken from your login account and cannot be changed.', NULL, NULL, 120, TRUE,
   UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)),

  ('programFirstId', 'PROGRAM_CHOICE', NULL, 'Program I am interested in (First Choice)', '第一志愿专业', 'single_choice', 'string', TRUE, 8,
   'programs', NULL, 'You may select up to two programs and their respective prime supervisors.', 'application_program_choices', 'program_code', 10, TRUE,
   UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)),
  ('supervisorFirstId', 'PROGRAM_CHOICE', NULL, 'Potential Supervisor (of First Choice Thrust)', '第一志愿导师', 'single_choice', 'number', TRUE, NULL,
   'supervisors_by_thrust', 'programFirstId', 'Type a name to search. Options depend on the selected program.', 'application_program_choices', 'supervisor_id', 20, TRUE,
   UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)),
  ('programSecondId', 'PROGRAM_CHOICE', NULL, 'Program I am interested in (Second Choice)', '第二志愿专业', 'single_choice', 'string', FALSE, 8,
   'programs', NULL, NULL, 'application_program_choices', 'program_code', 30, TRUE,
   UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)),
  ('supervisorSecondId', 'PROGRAM_CHOICE', NULL, 'Potential Supervisor (of Second Choice Thrust)', '第二志愿导师', 'single_choice', 'number', FALSE, NULL,
   'supervisors_by_thrust', 'programSecondId', 'Required once a second choice program is selected, and it cannot repeat the first choice supervisor.', 'application_program_choices', 'supervisor_id', 40, TRUE,
   UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)),
  ('proposedResearchAreas', 'PROGRAM_CHOICE', NULL, 'Proposed Research Area(s)', '拟研究方向', 'long_text', 'string', FALSE, 4000,
   NULL, NULL, NULL, 'application_details', 'proposed_research_areas', 50, TRUE,
   UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)),

  ('personalStatement', 'PERSONAL_STATEMENT', NULL, 'Personal Statement', '个人陈述', 'long_text', 'string', TRUE, 8000,
   NULL, NULL, NULL, 'application_details', 'personal_statement', 10, TRUE,
   UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)),

  ('pubTitle', 'PUBLICATIONS', NULL, 'Title of Publication', '论文题目', 'free_text', 'string', FALSE, 512,
   NULL, NULL, NULL, 'application_publications', 'title', 10, TRUE,
   UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)),
  ('pubVenue', 'PUBLICATIONS', NULL, 'Journal / Conference Name / Publisher', '期刊/会议/出版社', 'free_text', 'string', FALSE, 255,
   NULL, NULL, 'In descending order of importance.', 'application_publications', 'venue', 20, TRUE,
   UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)),
  ('pubAuthors', 'PUBLICATIONS', NULL, 'Author(s)', '作者', 'free_text', 'string', FALSE, 512,
   NULL, NULL, NULL, 'application_publications', 'authors', 30, TRUE,
   UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)),
  ('pubPublishDate', 'PUBLICATIONS', NULL, 'Publish/Accepted Date', '发表/接收日期', 'date', 'date', FALSE, NULL,
   NULL, NULL, 'Format: yyyy-mm-dd', 'application_publications', 'publish_date', 40, TRUE,
   UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)),
  ('pubStatus', 'PUBLICATIONS', NULL, 'Publication Status', '发表状态', 'single_choice', 'string', FALSE, 32,
   'static', NULL, NULL, 'application_publications', 'publication_status', 50, TRUE,
   UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)),
  ('pubUrl', 'PUBLICATIONS', NULL, 'URL', '链接', 'url', 'string', FALSE, 512,
   NULL, NULL, NULL, 'application_publications', 'url', 60, TRUE,
   UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)),

  ('expType', 'WORK_EXPERIENCE', NULL, 'Type', '类型', 'single_choice', 'string', FALSE, 16,
   'static', NULL, NULL, 'application_experiences', 'experience_type', 10, TRUE,
   UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)),
  ('expOrganization', 'WORK_EXPERIENCE', NULL, 'Name of Organization', '机构名称', 'free_text', 'string', FALSE, 255,
   NULL, NULL, NULL, 'application_experiences', 'organization', 20, TRUE,
   UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)),
  ('expPosition', 'WORK_EXPERIENCE', NULL, 'Position Held / Course or Program attended', '职位/课程', 'free_text', 'string', FALSE, 255,
   NULL, NULL, NULL, 'application_experiences', 'position', 30, TRUE,
   UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)),
  ('expPeriodStart', 'WORK_EXPERIENCE', 'expPeriod', 'Period Start', '开始日期', 'date', 'date', FALSE, NULL,
   NULL, NULL, 'Format: yyyy-mm-dd', 'application_experiences', 'period_start', 40, TRUE,
   UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)),
  ('expPeriodEnd', 'WORK_EXPERIENCE', 'expPeriod', 'Period End', '结束日期', 'date', 'date', FALSE, NULL,
   NULL, NULL, 'Format: yyyy-mm-dd', 'application_experiences', 'period_end', 50, TRUE,
   UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)),
  ('expResponsibilities', 'WORK_EXPERIENCE', NULL, 'Major Responsibilities/Training Areas', '主要职责', 'long_text', 'string', FALSE, 2000,
   NULL, NULL, NULL, 'application_experiences', 'responsibilities', 60, TRUE,
   UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)),

  ('consentDeclaration', 'STATEMENT', NULL, 'Declaration', '信息真实性声明', 'checkbox', 'boolean', FALSE, NULL,
   NULL, NULL, NULL, 'application_consents', NULL, 10, TRUE,
   UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)),
  ('consentMedia', 'STATEMENT', NULL, 'Media consent', '影像使用同意', 'checkbox', 'boolean', FALSE, NULL,
   NULL, NULL, NULL, 'application_consents', NULL, 20, TRUE,
   UTC_TIMESTAMP(3), UTC_TIMESTAMP(3));


-- ---------- 单选选项（Sheet1 D 列）---------- 

INSERT IGNORE INTO form_field_options (field_code, value, label_en, label_zh, sort_order, is_active)
VALUES
  ('gender', 'MALE', 'Male', '男', 10, TRUE),
  ('gender', 'FEMALE', 'Female', '女', 20, TRUE),

  ('idDocumentType', 'RESIDENT_ID', 'Resident Identity Card', '身份证', 10, TRUE),
  ('idDocumentType', 'HOME_RETURN_PERMIT', 'Mainland Travel Permit for Hong Kong and Macao Residents', '港澳居民来往内地通行证（回乡证）', 20, TRUE),
  ('idDocumentType', 'PASSPORT', 'Passport', '护照', 30, TRUE),

  ('needsStudentVisa', 'true', 'Yes', '是', 10, TRUE),
  ('needsStudentVisa', 'false', 'No', '否', 20, TRUE),

  ('phoneCountryCode', '+86', 'China (+86)', '中国 (+86)', 10, TRUE),
  ('phoneCountryCode', '+852', 'Hong Kong (+852)', '中国香港 (+852)', 20, TRUE),
  ('phoneCountryCode', '+853', 'Macao (+853)', '中国澳门 (+853)', 30, TRUE),
  ('phoneCountryCode', '+886', 'Taiwan (+886)', '中国台湾 (+886)', 40, TRUE),
  ('phoneCountryCode', '+1', 'United States / Canada (+1)', '美国/加拿大 (+1)', 50, TRUE),
  ('phoneCountryCode', '+44', 'United Kingdom (+44)', '英国 (+44)', 60, TRUE),
  ('phoneCountryCode', '+81', 'Japan (+81)', '日本 (+81)', 70, TRUE),
  ('phoneCountryCode', '+65', 'Singapore (+65)', '新加坡 (+65)', 80, TRUE),

  ('pubStatus', 'IN_PREPARATION', 'In Preparation', '准备中', 10, TRUE),
  ('pubStatus', 'UNDER_REVIEW', 'Under Review', '审稿中', 20, TRUE),
  ('pubStatus', 'REVISIONS_REQUIRED', 'Revisions Required', '需修改', 30, TRUE),
  ('pubStatus', 'ACCEPTED', 'Accepted', '已接收', 40, TRUE),
  ('pubStatus', 'PUBLISHED', 'Published', '已发表', 50, TRUE),

  ('expType', 'WORK', 'Work Experience', '工作', 10, TRUE),
  ('expType', 'INTERNSHIP', 'Internship', '实习', 20, TRUE),
  ('expType', 'TRAINING', 'Training', '培训', 30, TRUE),
  ('expType', 'VOLUNTEER', 'Volunteer work', '志愿服务', 40, TRUE),
  ('expType', 'EXTRACURRICULAR', 'Extracurricular Activities', '课外活动', 50, TRUE);
