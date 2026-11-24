# Agent 会话历史归档（只读）

> 本目录自 **2026-11-24** 起冻结，不再新增文件。
> 这里的内容是**历史事实，不是现行约束**。与代码、ADR、`docs/invariants.md` 冲突时，一律以后者为准。

## 为什么冻结

逐会话新建 markdown 会随迭代线性增长，且旧的临时判断会被误读为规则。自 2026-11-24 起改为分层承载：

| 内容 | 新的承载位置 |
| --- | --- |
| 现行业务约束 | [docs/invariants.md](../docs/invariants.md) |
| 跨模块决策 | [docs/decisions/](../docs/decisions/) |
| 本次改了什么、怎么验证 | PR 描述（[模板](../.github/pull_request_template.md)）+ [CHANGELOG.md](../CHANGELOG.md) |
| 过程性笔记、计划 | 不提交；放会话工作区或 issue |

## 布局

```text
.agent-history/
├── ARCHIVE.md            # 本文件
└── 2026-Q4/              # 按年份-季度分目录
    ├── INDEX.md          # 该季度的记录索引（只读）
    └── YYYY-MM-DD-<short-desc>.md
```

新季度归档时直接新建 `YYYY-QN/` 目录并放入记录，不修改既有目录。

## 怎么检索

```bash
rg -n "<模块名|状态名|错误码|表名|接口路径>" .agent-history
```

命中后按 `ARCHIVE.md` 顶部的权威顺序解读：只把其中的「业务不变量」当作线索，回到 `docs/invariants.md` 与代码确认。**检索结果为空不等于无约束**，仍须读代码与 [docs/test-matrix.md](../docs/test-matrix.md)。

## 保留与清理

归档不参与 CI 校验的强约束，仅做链接可解析检查。确认某季度内容已完全被 `docs/invariants.md` 与 ADR 覆盖后，可整体删除该季度目录（git 历史仍可追溯）。
