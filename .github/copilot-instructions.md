# Copilot repository instructions

- 每次修改仓库内容时，必须同步更新根目录 `VERSION`。
- 更新 `VERSION` 时，必须同时保持 `package.json` 与 `manifest.json` 中的 `version` 完全一致。
- 提交前先运行 `npm run check:version` 和 `npm test`。
