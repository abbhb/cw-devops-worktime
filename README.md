# cw-devops-worktime

DevOps 工时填报浏览器插件，支持 Chrome 与 Edge。

## 功能

- 根据关键词查询工作项并供用户选择
- 选择日期范围与本地日报文件夹，按 `YYYY-MM-DD(.md)` 匹配 Markdown 日报
- 生成按月日历预览，缺失日报以红色标签提示
- 批量调用工时填报接口并统计成功 / 失败 / 缺失结果
- 失败结果支持导出 Excel（`.xls`）
- reviewer / firstReviewer 与其他默认参数支持全局配置并持久化到插件本地存储
- 每次执行结果持久化保存，支持随时查看历史记录

## 目录结构

- `manifest.json`：Chrome / Edge 扩展清单（Manifest V3）
- `popup.html` / `popup.js`：主操作界面
- `options.html` / `options.js`：全局配置页面
- `background.js`：接口调用与历史记录持久化
- `utils.js`：共享工具方法
- `styles.css`：扩展页面样式

## 本地验证

```bash
cd <仓库目录>
npm run check:version
npm test
```

## 版本与发布

- 仓库根目录 `VERSION` 是发布版本源，`package.json` 与 `manifest.json` 中的版本号必须与它保持一致。
- 当 `main` 分支上的提交更新 `VERSION` 后，GitHub Actions 会自动执行版本校验、运行 `npm test`、打包扩展并按 `v<版本号>` 创建 / 更新 GitHub Release。
- Pull Request 会校验：只要仓库内容发生变更，就必须同步更新 `VERSION`，避免漏发版本。

## 安装方式

1. 打开 Chrome 或 Edge 的扩展管理页。
2. 开启“开发者模式”。
3. 选择“加载已解压的扩展程序”。
4. 选择当前仓库目录。
5. 在浏览器中先登录 `https://devops.cwoa.net`，再打开插件。

## 使用方式

1. 打开插件右上角“全局配置”，填写 `reviewer`、`firstReviewer`，按需调整默认工时参数。
2. 在主界面输入关键词搜索工作项并选择目标工作项。
3. 选择开始日期、结束日期与日报文件夹。
4. 点击“生成预览”，确认日历中缺失文件提示与日报内容预览。
5. 点击“开始填报”执行批量填报。
6. 在“操作记录”中查看每次执行结果，并按需导出失败 Excel。

## 注意事项

- 插件依赖浏览器中已有的 `devops.cwoa.net` 登录 Cookie。
- 日报文件内容按 Markdown 原文提交，不做渲染转换。
- 默认 `productId`、`productLineId` 等参数已按题目示例预填，可在配置页修改。
