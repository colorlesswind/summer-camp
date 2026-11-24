#!/usr/bin/env node
/**
 * 文档一致性检查：相对链接、ADR 编号与回链、INV 条目完整性、归档布局、CHANGELOG。
 *
 * 用法：
 *   node scripts/check-docs.mjs           # error 失败，warning 只提示
 *   node scripts/check-docs.mjs --strict  # warning 也失败（用于切换为 blocking）
 *
 * CI 中通过 continue-on-error 控制是否阻断；本脚本只负责判定。
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const strict = process.argv.includes('--strict');
const findings = [];
const seen = new Set();

const skipDirs = new Set(['node_modules', '.git', 'dist', 'coverage', '.npm-cache', '.acl-recovery']);
const requiredFiles = [
  'AGENTS.md',
  'docs/README.md',
  'docs/invariants.md',
  'CHANGELOG.md',
  '.github/pull_request_template.md',
  '.agent-history/ARCHIVE.md',
];

const add = (severity, file, line, message) => {
  const key = `${severity}|${file}|${line ?? ''}|${message}`;
  if (seen.has(key)) return;
  seen.add(key);
  findings.push({ severity, file, line, message });
};

const toRel = (absolute) => relative(root, absolute).split('\\').join('/');
const read = (absolute) => readFileSync(absolute, 'utf8');

const walk = (dir, out = []) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (skipDirs.has(entry.name)) continue;
      walk(join(dir, entry.name), out);
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      out.push(join(dir, entry.name));
    }
  }
  return out;
};

// 保留行号地清空围栏代码块，避免把代码示例里的链接当成真链接
const stripFencedCode = (text) => text.replace(/```[\s\S]*?```/g, (block) => block.replace(/[^\n]/g, ' '));

for (const file of requiredFiles) {
  if (!existsSync(resolve(root, file))) add('error', file, 1, '缺少治理必需文件');
}

const markdownFiles = walk(root);
// 原始笔试题为导入文档，引用了未入库的附件，不参与链接校验
const linkCheckIgnore = new Set(['笔试题-全栈.md']);

// 1. 相对链接可解析
const linkPattern = /!?\[[^\]]*\]\(([^)]+)\)/g;
for (const absolute of markdownFiles) {
  const file = toRel(absolute);
  if (linkCheckIgnore.has(file)) continue;
  const lines = stripFencedCode(read(absolute)).split('\n');
  lines.forEach((line, index) => {
    linkPattern.lastIndex = 0;
    let match;
    while ((match = linkPattern.exec(line)) !== null) {
      let target = match[1].trim();
      if (target.startsWith('<')) {
        const end = target.indexOf('>');
        if (end === -1) continue;
        target = target.slice(1, end);
      } else {
        target = target.split(/\s+/)[0];
      }
      if (!target) continue;
      if (/^(https?:|mailto:|tel:)/i.test(target)) continue;
      if (target.startsWith('#')) continue;
      const [pathPart] = target.split('#');
      if (!pathPart) continue;
      let decoded = pathPart;
      try {
        decoded = decodeURIComponent(pathPart);
      } catch {
        /* 保留原样 */
      }
      if (/[{}*]/.test(decoded)) continue;
      if (!existsSync(resolve(dirname(absolute), decoded))) {
        add('error', file, index + 1, `相对链接无法解析：${target}`);
      }
    }
  });
}

// 2. ADR 编号、状态、双向回链
const adrDir = join(root, 'docs', 'decisions');
const adrByNumber = new Map();
let adrFiles = [];
if (existsSync(adrDir)) {
  adrFiles = readdirSync(adrDir).filter((name) => /^ADR-.*\.md$/.test(name));
  for (const name of adrFiles) {
    const file = `docs/decisions/${name}`;
    const match = /^ADR-(\d{4})-([a-z0-9-]+)\.md$/.exec(name);
    if (!match) {
      add('error', file, 1, 'ADR 文件名应为 ADR-<四位编号>-<kebab-slug>.md');
      continue;
    }
    const number = match[1];
    if (adrByNumber.has(number)) add('error', file, 1, `ADR 编号重复：ADR-${number}`);
    else adrByNumber.set(number, name);
    if (!/状态[：:]/.test(read(join(adrDir, name)))) add('warning', file, 1, '缺少「状态：」行');
  }

  for (const name of adrFiles) {
    const file = `docs/decisions/${name}`;
    const own = (/^ADR-(\d{4})-/.exec(name) || [])[1];
    if (!own) continue;
    const text = read(join(adrDir, name));

    const supersededBy = /Superseded by ADR-(\d{4})/.exec(text);
    if (supersededBy) {
      const targetName = adrByNumber.get(supersededBy[1]);
      if (!targetName) {
        add('error', file, 1, `Superseded by 指向不存在的 ADR-${supersededBy[1]}`);
      } else if (!read(join(adrDir, targetName)).includes(`Supersedes ADR-${own}`)) {
        add('warning', file, 1, `Superseded 回链缺失：ADR-${supersededBy[1]} 应写「Supersedes ADR-${own}」`);
      }
    }

    const supersedes = /Supersedes ADR-(\d{4})/.exec(text);
    if (supersedes) {
      const targetName = adrByNumber.get(supersedes[1]);
      if (!targetName) {
        add('error', file, 1, `Supersedes 指向不存在的 ADR-${supersedes[1]}`);
      } else if (!read(join(adrDir, targetName)).includes(`Superseded by ADR-${own}`)) {
        add('warning', file, 1, `Superseded 回链缺失：ADR-${supersedes[1]} 应写「Superseded by ADR-${own}」`);
      }
    }
  }
}

// 3. 任何文档引用的 ADR 必须存在
for (const absolute of markdownFiles) {
  const file = toRel(absolute);
  const text = stripFencedCode(read(absolute));
  for (const match of text.matchAll(/ADR-(\d{4})/g)) {
    if (!adrByNumber.has(match[1])) add('error', file, 1, `引用了不存在的 ADR-${match[1]}`);
  }
}

// 4. invariants 条目完整性与代码锚点
const invariantsPath = join(root, 'docs', 'invariants.md');
if (existsSync(invariantsPath)) {
  const text = read(invariantsPath);
  const entries = [];
  let current = null;
  text.split('\n').forEach((line, index) => {
    const heading = /^### (INV-\d{2,3})\b/.exec(line);
    if (heading) {
      current = { id: heading[1], line: index + 1, body: [] };
      entries.push(current);
      return;
    }
    if (/^##\s/.test(line)) current = null;
    if (current) current.body.push(line);
  });

  const ids = new Set();
  for (const entry of entries) {
    if (ids.has(entry.id)) add('error', 'docs/invariants.md', entry.line, `INV 编号重复：${entry.id}`);
    ids.add(entry.id);
    const body = entry.body.join('\n');
    for (const field of ['规则', '权威实现', '兜底层级', '相关 ADR', '测试锚点', '变更记录']) {
      if (!body.includes(field)) add('warning', 'docs/invariants.md', entry.line, `${entry.id} 缺少字段：${field}`);
    }
  }
  if (entries.length === 0) add('error', 'docs/invariants.md', 1, '未找到任何 INV 条目');

  const checkedPaths = new Set();
  for (const match of text.matchAll(/`([^`\n]+)`/g)) {
    const anchor = match[1].trim();
    if (!/^(server|ui|docs|scripts|\.github|\.agent-history)\//.test(anchor)) continue;
    if (/[{}*<>|\s]/.test(anchor)) continue;
    if (checkedPaths.has(anchor)) continue;
    checkedPaths.add(anchor);
    if (!existsSync(resolve(root, anchor))) {
      add('error', 'docs/invariants.md', 1, `权威实现 / 测试锚点路径不存在：${anchor}`);
    }
  }
}

// 5. 归档布局：根目录只允许 ARCHIVE.md，季度目录命名 YYYY-QN
const archiveDir = join(root, '.agent-history');
if (existsSync(archiveDir)) {
  for (const entry of readdirSync(archiveDir, { withFileTypes: true })) {
    if (entry.isDirectory() && !/^\d{4}-Q[1-4]$/.test(entry.name)) {
      add('warning', `.agent-history/${entry.name}`, 1, '归档目录应命名为 YYYY-QN（例如 2026-Q4）');
    }
    if (entry.isFile() && entry.name.endsWith('.md') && entry.name !== 'ARCHIVE.md') {
      add('warning', `.agent-history/${entry.name}`, 1, '归档已冻结：根目录只允许 ARCHIVE.md，记录应放入季度目录');
    }
  }
}

// 6. CHANGELOG 存在性与 [Unreleased]
const changelogPath = join(root, 'CHANGELOG.md');
if (existsSync(changelogPath) && !/^##\s*\[Unreleased\]/m.test(read(changelogPath))) {
  add('warning', 'CHANGELOG.md', 1, '缺少 [Unreleased] 段');
}

// 7. PR 改动源码但未更新 CHANGELOG（warning；PR 描述包含 skip-changelog 可跳过）
const baseRef = process.env.GITHUB_BASE_REF;
if (baseRef && existsSync(join(root, '.git'))) {
  try {
    const changed = execFileSync('git', ['diff', '--name-only', `origin/${baseRef}...HEAD`], {
      cwd: root,
      encoding: 'utf8',
    })
      .split('\n')
      .filter(Boolean);
    const touchesSource = changed.some((file) => file.startsWith('server/src/') || file.startsWith('ui/src/'));
    const prBody = process.env.PR_BODY || '';
    if (touchesSource && !changed.includes('CHANGELOG.md') && !/-\s*\[[xX]\]\s*skip-changelog/.test(prBody)) {
      add(
        'warning',
        'CHANGELOG.md',
        1,
        '本次改动了 server/src 或 ui/src，但 CHANGELOG.md 未更新（纯重构可在 PR 模板勾选 skip-changelog）',
      );
    }
  } catch {
    add('warning', 'CHANGELOG.md', 1, `无法读取 origin/${baseRef} 的 diff，跳过 CHANGELOG 完整性检查`);
  }
}

// 输出
const severityRank = { error: 0, warning: 1 };
findings.sort(
  (a, b) =>
    severityRank[a.severity] - severityRank[b.severity] ||
    a.file.localeCompare(b.file) ||
    (a.line ?? 0) - (b.line ?? 0),
);

const inActions = Boolean(process.env.GITHUB_ACTIONS);
for (const finding of findings) {
  const location = finding.line ? `:${finding.line}` : '';
  if (inActions) {
    const lineParam = finding.line ? `,line=${finding.line}` : '';
    console.log(`::${finding.severity} file=${finding.file}${lineParam}::${finding.message}`);
  } else {
    console.log(`[${finding.severity}] ${finding.file}${location} ${finding.message}`);
  }
}

const errors = findings.filter((item) => item.severity === 'error').length;
const warnings = findings.filter((item) => item.severity === 'warning').length;
console.log(`\n文档校验：${errors} error，${warnings} warning，扫描 ${markdownFiles.length} 个 markdown 文件。`);

if (strict && warnings > 0) {
  console.log('--strict 模式：warning 视为失败。');
  process.exit(1);
}
process.exit(errors > 0 ? 1 : 0);
