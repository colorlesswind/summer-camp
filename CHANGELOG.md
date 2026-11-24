# Changelog

本文件记录面向使用者的变更。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

- 变更类型：`Added` / `Changed` / `Deprecated` / `Removed` / `Fixed` / `Security`。
- 每次合并到 `main` 前，把本 PR 的条目写进 `[Unreleased]`；发布时把 `[Unreleased]` 改为版本号与日期。
- 纯文档、重构、无用户可见变化的 PR 在模板中勾选 `skip-changelog`，可跳过。

## [Unreleased]

### Added

- 文档治理：新增 [`docs/invariants.md`](./docs/invariants.md) 作为现行业务约束的唯一登记表（INV-01 ~ INV-22）。
- 新增 [`docs/README.md`](./docs/README.md)（文档导航与权威顺序）、[PR 模板](./.github/pull_request_template.md)、本 CHANGELOG。
- 新增文档校验脚本 `scripts/check-docs.mjs` 与 `.github/workflows/docs.yml`（先以 warning 运行）。

### Changed

- [`AGENTS.md`](./AGENTS.md)：检索顺序改为 `docs/invariants.md` → Accepted ADR → 代码/测试 → 归档；收工不再新建会话记录，改为更新不变量 + 填 PR 描述 + 更新本文件。
- 变更事实改由 PR 描述与本文件承载。

### Removed

- `.agent-history/_TEMPLATE.md`：由 PR 模板取代。
- `.agent-history/` 停止新增记录，整体转为只读归档（按年份-季度分目录）。
