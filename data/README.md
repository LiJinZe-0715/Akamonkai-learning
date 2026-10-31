# 内容数据维护

这里是可编辑的数据源。程序实现在 `src/`，请不要把课程正文写入 React 或领域服务。

- `content/catalog.json`：教材顺序、课次、学习类型和计数。
- `content/kanji-daily.json`：《1日15分の漢字練習》的全部单字单元、词汇、译文、例句和题目。
- `content/kanji-700.json`：《中級漢字700》的全部单字单元、词汇、译文、例句和题目，与前一本独立维护。
- `content/units/<bookId>/**/*.json`：其他教材按课次分组的内容、题目、例句与词汇引用。
- `content/vocabulary.json`：其他教材的稳定词汇 ID 对应词条。
- `content/localization/learning.json`：其他教材的课程中文、英文释义。
- `content/localization/ui.json`：界面中文、英文文案。
- `content/reference/verbs.json`：独立动词活用参考资料，包含自己的译文。

## 课程目录

```text
content/units/
  minna/                         大家的日语（51 个课程文件）
    elementary-1/lesson-01.json   初级Ⅰ，第 01–25 课
    elementary-2/lesson-26.json   初级Ⅱ，第 26–50 课
    katakana.json                片假名练习
  katakana-practice/              片假名练习（35 个文件）
    lesson-01.json               第 01–35 课，词汇与拼写测验
  topic/                         Topic 系列（14 个文件）
    topic-01/lesson.json          Topic 1 的课程
    topic-02/section-01.json      Topic 2 的第 1 节
    topic-03/reading.json         Topic 3 的阅读练习
  chukyu/                        学习中级日语（8 个文件）
    lesson-01.json               第 01–08 课
  n2/                            N2 文法（15 个文件）
    day-01-mono.json              按学习日和语法主题命名
```

上面的文件名为代表例子，普通课程共有 123 个源文件。加上两本汉字教材文件中的 700 个单字单元与 `content/reference/verbs.json` 中的独立参考资料，目录合计 882 个单元。

## 汉字内容

两本书各自维护一个汉字正文源文件：`content/kanji-daily.json` 与 `content/kanji-700.json`，格式为 `{schemaVersion: 1, bookId, units: [...]}`。文件的 `bookId` 必须与文件名一致，内部单元只能属于该书，不能混入另一套教材的内容。每个单元只对应一个汉字，`articles` 只有该字的一篇文章，`words` 与 `questions` 归属于该字，词条和 `texts` 直接存入单元。目录显示 `漢字 001 一`，按编号逐字导航；阅读时每 20 字合成一课（`第N課`），与教材的课次一致。

- `kanji-daily`：`kanji-intermediate-1` 至 `kanji-intermediate-540`，连续收录 001–540。
- `kanji-700`：`kanji-new-301` 至 `kanji-new-500`，已收录 301–500，共 200 字；461–500 依据 `kanji700/` 的 8 张照片录入（第9・10課，p78–p87）。
- 新增 001–210 根据 `kanji/` 中 68 张照片录入，`source` 保留图片路径、教材页码、编号及笔画数，仅用于维护，编译时剔除。
- 原有词汇、文章、题目和共享进度 ID 保留；综合题按考查的目标字归入对应单字单元，不丢弃题目。
- 词汇保留教材的原始词形，包括「ます」形；同形不同读音或含义保留独立词条。例句用 `[漢字:かな]` 标注读音。
- 收藏与掌握记录继续共用 `word-aliases.json`。旧范围链接进入同编号的单字入口；题源改变后旧范围草稿失效，旧成绩不代表新的单字成绩。
- 没有可区分选项的单字单元不提供词义选择测验，仍提供词汇、例句与汉字读音练习。

新增汉字直接维护所属教材的 JSON，并同步 catalog 的标题、词汇数、题目数和可用模式。

其他教材新增课程放入与 JSON 中 `bookId` 相同的目录；课次和学习日编号补齐两位数字，Topic 按主题编号分目录。JSON 中的 `id` 是稳定接口，不因文件改名而变化。普通课程仍按稳定 ID 生成 `public/content/units/<id>.json`；两本汉字教材分别生成到 `public/content/kanji-daily.json` 与 `public/content/kanji-700.json`，HTTP 仓储只加载当前教材的文件，每本书独立缓存与重试。

修改后运行 `pnpm check`，再运行 `pnpm build`。数据生成到 `public/content/` 与发布目录 `dist/content/`。开发时改动 JSON 后运行
`node scripts/build-content.mjs` 并刷新页面；数据不会直接从源码目录热加载。

编辑释义时保留原有 ID，避免破坏学习记录和引用。新增课次时同步维护 catalog 的描述、词汇数量和试题数量。`public/content/`、`dist/`、`work/` 是忽略目录，无需推送。`kanji/` 原始照片用于核对，不是运行资源。网站需构建和部署，Android App 需重新打包安装后才会包含新内容。
