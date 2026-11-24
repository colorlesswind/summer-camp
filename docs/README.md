# 文档导航与规则

> 本文件说明「什么内容写到哪里」。规则主体见 [AGENTS.md](../AGENTS.md)，约束清单见 [invariants.md](./invariants.md)。

## 权威顺序

冲突时从高到低：

1. 可执行代码与测试
2. [decisions/](./decisions/) 中状态为 `Accepted` 的 ADR
3. [invariants.md](./invariants.md)
4. `server/README.md` 等说明性文档
5. [`.agent-history/`](../.agent-history/ARCHIVE.md) 归档（仅背景，不构成约束）

## 四类文档

| 类型 | 位置 | 生命周期 | 判断标准 |
| --- | --- | --- | --- |
| 决策 | [decisions/](./decisions/) | 长期，数量有界；不可直接改写，用新 ADR + `Superseded` 演进 | 难以反转、跨模块、或「读代码看不出为什么」 |
| 现行约束 | [invariants.md](./invariants.md) | 与代码同寿命，就地更新 | 一条可判定规则，能被测试或代码锚点验证 |
| 用例矩阵 | [test-matrix.md](./test-matrix.md) | 与需求同寿命 | 需求到用例的追踪与状态真值 |
| 变更事实 | PR 描述 + [CHANGELOG.md](../CHANGELOG.md) | 随版本发布归档 | 改了哪些文件、什么行为、怎么验证 |

过程性内容（计划、笔记、进度、探索记录）**不提交到仓库**，放会话工作区、issue 或 PR 讨论。

## 该写哪一种

```text
是「为什么这么定、以后不能随便改」吗？
├── 是 → ADR（decisions/），并在 invariants.md 留一条一句话规则
└── 否
    ├── 是「系统必须始终成立的行为」吗？ → invariants.md
    ├── 是「这次改了什么」吗？ → PR 描述 + CHANGELOG
    └── 是「怎么用 / 怎么跑」吗？ → README（就近放：server/、ui/）
```

## 维护规则

- 同一规则只写一次：`invariants.md` 写规则与锚点，README 与 ADR 只引用 INV 编号。
- 新增文档必须能从本文件或 [AGENTS.md](../AGENTS.md) 找到入口，否则视为孤儿文档。
- 已冻结的 [`.agent-history/`](../.agent-history/ARCHIVE.md) 不再新增文件。
- 文档校验在 CI 中先以 warning 运行，见 [.github/workflows/docs.yml](../.github/workflows/docs.yml)。
