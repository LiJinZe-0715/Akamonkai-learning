# 前端模块与依赖约定

本项目使用 React 19、TypeScript 严格模式和 Vite 8。没有独立路由库或全局状态库；React Context 提供已组装的应用接口、语言和学习进度，组件
hooks 管理交互及异步读取状态。课程 URL 仍是 `?unit=<id>&view=<view>`，首页仍用原有锚点，链接保留部署目录的相对路径。样式以 Tailwind CSS 4
作为引擎：`index.css` 引入 Tailwind 的 preflight 与 `@theme` 令牌，组件样式按语义类写在 `presentation/styles` 的普通 CSS 中，不引入
CSS-in-JS 或 DI 框架。

## 业务上下文及划分依据

| 上下文            | 业务概念及一致性边界                                                       | 展示入口                       |
|-------------------|----------------------------------------------------------------------------|--------------------------------|
| curriculum        | 教材、课次、可用学习模式；目录顺序、模式可用性、搜索和相邻课次选择         | 首页、课次外壳                 |
| vocabulary        | 稳定词条 ID、词形、读音、释义引用与搜索                                    | 词汇页                         |
| grammar           | 文章层级、规则、例句与目录                                                 | 文法和汉字例句共用页           |
| assessment        | 题目、作答、允许的多个答案、规范化、评分、乱序及错题重练                   | 各类测验共用页                 |
| learning-progress | 同一版本化进度中的词条标记、测验结果和最近访问；不可变命令、校验及合并     | Context 更新控制、记录导入导出 |
| localization      | 文本 ID、语言选择和中英文隔离；辅助上下文                                  | 共享 Text 与 UI 查询           |
| speech            | 对话轮次、自我角色跨课共享、其他角色按课隔离；浏览器及 VOICEVOX 为适配实现 | 共享朗读控件                   |

这些边界来自数据概念和业务规则：例如文法、汉字、片假名页面共用 assessment，并没有按页面新建领域。词汇页的收藏属于
learning-progress，词汇文本搜索属于 vocabulary。首页续学、带标记的词汇查询和测验结果记录是跨上下文用例，放在
`src/application`，通过模块公开接口协作。DashboardService 显式接收 CurriculumDiscovery 查询接口，由 CurriculumService
调用其内部目录规则；首页和课次导航不直接绑定具体课程服务或领域查询实现。它们不是新领域，也不在 Context 中复制规则。

## 实际目录

```text
src/
  bootstrap/                       # composition root：创建适配器并注入应用服务
    create-study-services.ts       # 创建具体适配器和学习服务
    initialize-study-services.ts   # 加载 UI 译文及词汇别名后初始化服务
  application/
    study-services.ts              # 注入表现层的接口集合
    dashboard-service.ts           # 课程与进度联查、续学降级、最近记录
    study-session-service.ts       # 开始测验、完整性检查、记录结果
    vocabulary-study-service.ts    # 本地化搜索与学习标记筛选组合
  modules/
    curriculum/
      domain/                      # Curriculum、学习模式约束、目录查询与导航规则
      application/                 # 目录/课次读取端口和查询服务
      infrastructure/              # HTTP 仓储、未知 JSON 的校验与模型映射
      presentation/
        pages/                     # CatalogScreen、LessonScreen
        hooks/                     # useDashboard、useCatalog、useLesson
        data/                      # 学习模式标签、首页展示数量和固定文案
        curriculum-routes.ts       # 相对 URL 的展示适配
        index.ts                   # UI 公开入口
      public.ts                    # 业务公开接口
    vocabulary/
      domain/ application/
      presentation/pages/ hooks/ data/ index.ts
    grammar/
      domain/ application/
      presentation/pages/ grammar-view-model.ts index.ts
    assessment/
      domain/ application/
      infrastructure/              # 测验草稿的浏览器存储适配器
      presentation/pages/ hooks/ data/ index.ts
    learning-progress/
      domain/                      # LearningProgress、进度约束、统计及标记筛选
      application/                 # 基本用例、持久化命令、文件传输用例及端口
      infrastructure/              # 浏览器存储与选中文件、下载适配器
    localization/
      domain/ application/ infrastructure/
    speech/
      domain/                      # 对话分段、自我角色别名和存储角色身份
      application/ infrastructure/ # 语音端口、外部引擎及配置
  presentation/
    App.tsx StudyContext.tsx        # 页面选取、注入与 UI 状态反馈
    shell/                         # 导航、文件工具交互及相关展示配置
    screens/                       # 应用级页面导出入口
    components/                    # 跨业务复用的日文文本、朗读、图标等 UI
    styles/                        # 原有 CSS 和公共设计变量
  shared/
    kernel/                        # 语言/文本类型、Clock 端口
      text-types.ts                # Locale、TextId、Segment 与 TranslationCatalog
    infrastructure/                # 与业务无关的 JSON HTTP 与系统时钟适配
scripts/check-study-workflows.mjs   # 新抽取规则、用例及适配器契约测试
scripts/check-module-contracts.mjs # 模块服务、数据解码和适配器契约测试
scripts/check-persistence-and-validation.mjs # 多页面提交、数据恢复、草稿和输入边界回归
```

业务简单的模块不需要仓储或空 infrastructure 目录。`src/bootstrap` 是 composition root，不使用 DI 容器。

## 分层与依赖

- **domain** 只依赖自己的领域代码和 shared/kernel。用带行为的 Curriculum、LearningProgress
  和明确输入输出的纯函数表达规则。目录/进度/角色函数不读取全局状态；测验乱序显式接收随机源。
- **application** 依赖 domain 或其他模块的业务公开接口。定义用户用例及端口，不使用 React、DOM、文件 API 或 HTTP 实现。
- **infrastructure** 实现内部定义的端口。课次 mapper 接收 unknown，校验后构造独立的词条、题目、文章及文本对象；剥离传输扩展字段，外部
  DTO 不直接成为共享的模型。
- **presentation** 通过注入的应用接口执行操作。hooks 只处理搜索输入、筛选选择、加载/错误、分页、重试、滚动和 UI
  状态；领域结果用于显示。grammar-view-model 预计算例句的展示轮次，不修改文章数据。
- **bootstrap** 创建具体 HTTP、存储、文件、时钟和语音适配器。组件不创建仓储或具体业务服务。

跨业务访问 `public.ts`；跨业务 UI 组装访问 `presentation/index.ts`。禁止调用其他模块的内部文件。业务公开入口不再导出展示数据；
模式校验使用领域的 isStudyView，学习模式标签使用 presentation 入口或模块内 data/study-view-labels。

LessonBundle 是课程读取的组合契约，由课次外壳和跨模块应用用例使用。词汇页面只接收词条与译文，文法页面只接收文章、译文与课次 ID，
测验页面只接收应用层生成的题源、译文、课次 ID 和学习模式，不依赖整个课程包。简单目录投影使用 grammarContents 函数；
语音适配器直接实现 SpeechUseCases，由 bootstrap 注入，不经过无额外职责的转发服务。

架构检查覆盖 domain/application 的技术隔离、框架隔离、HTTP/存储/文件 API 边界、源数据导入边界、模块公开入口，以及含 type-only
导入在内的循环依赖。仓库没有独立 ESLint 配置或 lint 命令；不要将这些检查称为 ESLint 已通过。

## 样式、数据与状态的归属

| 内容                                              | 维护位置                                                                                 |
|---------------------------------------------------|------------------------------------------------------------------------------------------|
| 色彩、尺寸及公共设计变量                          | presentation/styles/theme.css                                                            |
| 通用排版、组件、目录、学习页与汉字样式            | presentation/styles 中的 theme/shell/catalog/study/kanji.css                             |
| 教材目录、词条、文法、题库                        | 普通课程在 data/content/units 按 bookId 分组；汉字教材各自使用 data/content/kanji-daily.json 和 data/content/kanji-700.json，按单字组织并分别生成对应的 public/content JSON |
| 中英文 UI 文案                                    | data/content/localization/ui.json，启动时通过本地化端口加载                              |
| 日文学习模式标签、UI 文本 ID 映射                 | curriculum/presentation/data/study-view-labels.ts                                        |
| 首页初始/追加展示数量、最近记录数量及固定栏目标语 | curriculum/presentation/data/catalog-display.ts                                         |
| 词汇展示筛选选项                                  | vocabulary/presentation/data/word-filters.ts；筛选规则和类型约束仍在 learning-progress/domain |
| 测验分页数量                                      | assessment/presentation/data/assessment-pagination.ts；评分完整性规则仍在 assessment/domain |
| 导航目标、图标和对应文案 ID                       | presentation/shell/data/navigation.ts                                                    |
| VOICEVOX 地址和语音存储键                         | speech/infrastructure/speech-config.ts                                                   |
| 合成测试数据、替代端口                            | scripts/check-study-workflows.mjs 等测试文件，不进入生产模块                             |

UI 状态包括输入、选中的教材/筛选、展开数量、当前分页、提交后的展示锁定和通知；业务状态是版本化学习进度和测验题目/答案；远程状态是目录/课次的读取结果与失败。目录和课次
hooks 保留取消后的结果屏蔽，课次重试沿用仓储的失败请求清理与并发合并机制。语音的 AbortController、播放序列取消、URL
和资源清理仍在适配器内。

StudyProvider 分别提供服务、语言、进度、稳定的进度操作和反馈 Context。组件按需使用 useServices、useLanguage、useProgress、
useProgressActions 和 useFeedback；译文组件只订阅服务与语言，并缓存相同属性下的渲染。内存进度通过 ProgressService.merge
直接合并对象，JSON 转换只用于文件及存储边界。词条与题目字段为只读，Question 使用选择题／文本题联合类型约束对应的答案字段。
表现层的 ProgressUseCases 不暴露直接 save，写入统一经过带互斥锁的进度命令。

## 真实调用关系

以词条的“加入生词”为例：

1. VocabularyScreen 绑定点击事件，调用 useVocabulary 返回的 markWord 控制接口。
2. Context 委托注入的 ProgressCommandService.mark，并只消费 ProgressChange 显示新状态及存储错误通知。
3. 命令用例调用 ProgressService.commit，在浏览器互斥锁内读取并合并最新进度，再执行 mark 和 save；同一服务实例的命令也按队列执行。
4. ProgressService 将词条映射为稳定的共享进度 ID。LearningProgress.mark 校验 ID，切换 saved 并记录该字段的时间，不改变旧快照。
5. BrowserProgressRepository 将 Progress 序列化，写入原有
   akamonkai.progress.v1。发现损坏数据时先保留原文恢复备份，备份失败则不覆盖原文。写入失败仍返回内存进度并提示导出；不支持
   Web Locks 时不执行可能丢失其他页面记录的无锁写入。storage 事件同步其他页面的变更。

完整测验提交经 useAssessment → ProgressCommands.replace 的锁内更新回调 → StudySessionService.submit → assessment.grade →
ProgressService.record → LearningProgress.record 得到进度并持久化；未答完的输入不会记录结果，提交期间锁定作答并防止重复提交。错题重练仅展示本次结果，不覆盖完整测验记录。题目加载时经过
CurriculumService 和 HTTP mapper；提交本身没有 HTTP 请求。

DraftService 通过 BrowserDraftRepository 保存未提交作答。领域层只保存当前题库签名、题目 ID
与选项排列、答案、分页和练习范围；恢复时校验所有索引并从当前题库重建题目，不信任草稿中的内容或答案键。签名变化时丢弃旧草稿，提交完成后清除草稿。
DraftService 复用同一只读题源及题目排列的签名和索引；普通作答变化在停顿 200 毫秒后保存，分页、重新开始、页面隐藏及卸载时补存。
题目或选项的更新必须创建新对象／数组，避免复用已缓存的排列。草稿版本、签名格式和存储键保持兼容。

导入经 Shell → useProgressTools → ProgressTransferService.import → 文件端口读取 → 获取最新内存进度 →
ProgressService.import/领域校验与合并 → ProgressCommands.replace 的锁内重新合并 → 存储适配器。2,000,000
字节限制是文件导入用例的输入约束。公开返回 imported 或 invalid-file，读取、JSON 解析和版本验证错误都映射为 invalid-file。UI
等待持久化结果，保存失败时保留存储错误提示。下载适配器在 finally 中释放对象 URL。

## 兼容性和验证

两本汉字教材各自使用一个独立 JSON 源文件与运行资源，内部保持逐字单元。「1日15分の漢字練習」有 540 个入口，「中級漢字700」有 160 个入口。HTTP 仓储根据单元 ID 选择所属教材，只读取并校验该书的整包，按教材分别缓存解码结果；同一本书内的并发请求合并，失败只清除该书的缓存，另一套教材继续使用自己的数据。解码器校验整包及每个单元的教材归属，拒绝混入另一套教材。普通课程仍按课请求独立 JSON。`scripts/check-kanji.mjs` 覆盖逐字归属、编号连续性、目录导航、照片来源、教材隔离、各书请求缓存与重试。

- 课程查询 URL 和内容 ID 是稳定接口。screens 页面导出统一使用实际页面名称，教材目录入口为 CatalogScreen；lessonHref 导出继续可用。
- 进度仍为 version 1，存储键和导出文件名仍是原值，新增可选 wordUpdatedAt。成绩及最近访问按时间合并，标记按字段时间合并；无时间的旧备份保留本地冲突值、补充不存在的词条。旧
  ID 经固定映射迁移，不改变教材 placement 或翻译引用。自我角色的存储键和未配置 VOICEVOX 时的降级保留。
- 词汇测验同时按中文和英文释义去重，保证两种语言的选项可区分；切换语言不重新抽题或改变答案索引。
- UI 目录必须包含所有必备键且有非空中英文文本，启动层错误边界覆盖 Context、App 和 Shell。教材 segment 必须是互斥的合法字符串形态。共享
  HTTP 读取在 15 秒后中止并报错，启动、目录和课次保留重试入口。
- 无当前语言说明的词条不渲染用法折叠；课程内部锚点保留教材库高亮。测验滚动使用 auto，让 CSS
  的减少动态效果规则生效。朗读按钮卸载不停止其他组件发起的播放；停止播放与中止引擎探测分开处理。
- 课次组件在原路由方案下整页导航；不增加单页路由。未来若改成组件内切换同一页面的 lesson/view，应明确重置测验状态和远程数据状态。

`pnpm build` 执行内容、架构、领域规则、SSR、语音和学习流程检查，生成静态内容，执行 tsc --noEmit 和 Vite 生产构建。`pnpm check`
单独执行检查。回归测试覆盖续学与陈旧路由、搜索和标记、多页面保存、导入合并与失败反馈、损坏数据恢复、草稿恢复、错题成绩保护、输入校验、请求超时、文件映射和下载
URL 清理。生产预览使用 `/Akamonkai-learning/` 子目录，应检查教材资源读取及相对链接。
Pages CI 另外运行 pnpm android:test，覆盖 Android 语音／备份桥接和 APK 发布元数据检查。

## 后续代码放置规则

新增业务规则先找已有上下文；跨上下文的用户流程放 application，并只用公开接口。新增数据适配器实现 application/domain
定义的必要端口，在 bootstrap 注入。对应业务页面和 hooks 放同一模块的 presentation；数据展示配置按语义放该模块的
presentation/data。公共 CSS/UI 才留在顶层 presentation。shared 只接纳不属于任何业务的类型、纯函数或技术适配，不建立统一
utils/constants/data 收容目录。
