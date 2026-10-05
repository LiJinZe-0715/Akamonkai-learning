# 内容数据维护

这里是可编辑的数据源。程序实现在 `src/`，请不要把课程正文写入 React 或领域服务。

- `content/catalog.json`：教材顺序、课次、学习类型和计数。
- `content/units/*.json`：课次内容、题目、例句与词汇引用。
- `content/vocabulary.json`：稳定词汇 ID 对应的词条。
- `content/localization/learning.json`：课程中文、英文释义。
- `content/localization/ui.json`：界面中文、英文文案。
- `content/reference/verbs.json`：独立动词活用参考资料，包含自己的译文。
- `content/provenance.json`：内容来源信息。

修改后运行 `pnpm check`，再运行 `pnpm build`。数据生成到 `public/content/` 与发布目录 `dist/content/`。开发时改动 JSON 后运行 `node scripts/build-content.mjs` 并刷新页面；数据不会直接从源码目录热加载。

编辑释义时保留原有 ID，避免破坏学习记录和引用。新增课次时同步维护 catalog 的课次描述、词汇数量和试题数量。网站数据按发布版本更新，不需要改业务代码，但仍需完成发布。
