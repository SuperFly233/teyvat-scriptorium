# 提瓦特剧本室 · Teyvat Scriptorium

原神剧情逐句对照阅读器。目录收录 1,714 个常规任务及 19 个邀约事件，支持 15 种游戏语言按需载入、最多三语对照、逐句选稿、角色筛选、手机阅读和可打印 PDF。

线上站点：[teyvat-scriptorium.pages.dev](https://teyvat-scriptorium.pages.dev)

## 本地运行

```bash
npm install
npm run data:update
npm run dev
```

生产构建与检查：

```bash
npm test
npm run build
npm run preview
```

## 更新剧情数据

更新轻量目录与第 `1700` 章快照：

```bash
npm run data:update
```

正文提供三种可切换策略：自动模式由 Project Amber / Yatta 提供结构化多语言目录与元数据，再以 Honey Hunter World 的台词节点和 `next` 关系校验、补强分支；Yatta 模式仅使用其结构化接口；Honey 模式以 Honey 台词为先，同时由 Yatta 补齐目录及缺失元数据。上游暂不可用时会显示实际回退状态，不会把回退伪装成所选来源。正文支持 15 种游戏语言，每次只加载当前选择的 1–3 种语言。版本元数据优先采用 Yatta 更新记录；其未覆盖的早期任务由 Genshin Impact Wiki 的 `Released in Version` 分类补足。地区元数据同样优先采用 Wiki 的任务分类；只能由标题识别的条目会标记为推断，上游目录没有提供归属字段的条目会明确显示“版本数据缺失”或“未归属地区”。Wiki 查询结果缓存于 `public/data/wiki-metadata.json`，外站短暂不可用不会破坏已有目录。

目录提供任务档案与旅行历程两种视图。任务类型、国家和版本均可多选，排序使用一致的自绘菜单；传说任务与邀约事件会明确标注角色、章节及幕次。旅行历程可按版本或国家编排，同一版本依国家顺序、同一章依章幕数字由上至下排列；各国家和任务类型均可带动画展开，世界、活动与邀约也能从时间线直接进入。顶部快速导航、底部定位条和“最新版本”按钮保持同步。

## 打印与 PDF

- A4、A5、Letter；横向或纵向；7–13 pt 字号与 6–24 mm 页边距。
- 当前选择的 1–3 种语言可并列或上下排列；一般、紧凑、超紧凑三档密度。
- 页眉和页脚各有左、中、右三个槽位，可拖动交换，并可放置内容标题、当前章节、打印时间、网站版本、页码或自定义文字。
- “系统打印”和“保存矢量 PDF”都调用浏览器原生分页；文字可搜索、可选择，放大不会变成模糊图片。
- 内置预览可查看完整纸张并逐页翻阅、缩放；并列栏宽可直接拖动分隔线或用滑杆精确调整。
- “超紧凑”双语稿采用两组中外文对照的四栏信息流，减少横向空白和过长的中外文间距。
- 第 1700 章 228 句中英稿在 A4 纵向“超紧凑”档约为 2–3 页；普通与紧凑档保留更大的阅读字号。

## 自动更新

- 每次打开目录都会先读取本站快照，再由 `/api/catalog` 在后台检查 Yatta 最新 CHS / EN 任务索引；新增与标题修订会无刷新合并，并显示 Toast 与检查结果。
- Cloudflare 会缓存后台目录数小时，减少对上游资料源的请求。剧情正文继续按需读取，并显示实际接收字节与解析进度。
- GitHub Actions 每天自动运行 `npm run data:update`。常规目录、邀约事件和默认正文彼此隔离，每一份新快照都要先通过数量、唯一性及正文统计校验；单一外站短暂不可用时会保留 14 天内的最近有效快照，同时继续发布其他成功结果。
- 邀约事件以 Yatta 的角色索引和结构化任务接口自动发现新增章节，Honey 仅用于页面链接与人工核验，避免其 Cloudflare 反爬页面成为定时任务的单点故障。Actions 运行页会显示每类资料的检查结果与是否产生提交。
- 只有剧情内容或元数据发生语义变化时才刷新 `generatedAt` 并提交；日常“检查过但没有更新”不会产生空提交、空部署或失败邮件。

## 部署到 Cloudflare Pages

```bash
npm run build
npx wrangler pages deploy ./dist --project-name teyvat-scriptorium
```

已经配置好 GitHub 与 Cloudflare 时可一次完成推送和部署：

```bash
npm run publish
```

## 数据与权利说明

剧情文本及《原神》相关名称、图像和商标的权利归 HoYoverse / COGNOSPHERE 及相关权利人所有。本项目是非官方、非商业的语言学习与剧情查阅工具，不隶属于或受其认可。数据来自 [Project Amber / Yatta](https://gi.yatta.moe/) 与 [Honey Hunter World](https://gensh.honeyhunterworld.com/)，版本与地区补充元数据来自 [Genshin Impact Wiki](https://genshin-impact.fandom.com/)。网站只负责公开资料的节点匹配、多语言对齐、分支还原、搜索筛选和打印排版；设置中可查看每种来源的优缺点、当前实际来源及当前任务原页面。请勿将项目数据用于商业再分发。
