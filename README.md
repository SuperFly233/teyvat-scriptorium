# 提瓦特剧本室 · Teyvat Scriptorium

原神剧情的中文 / 英文逐句对照阅读器。目录收录 1,714 个任务，正文按需加载；支持多维筛选、五种阅读模式、逐句选稿、手机快捷操作、深色模式和可打印 PDF。

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

目录与正文从 Project Amber / Yatta 的 CHS、EN 结构化接口读取，并按游戏内部 ID 合并。版本元数据优先采用 Yatta 更新记录；其未覆盖的早期任务由 Genshin Impact Wiki 的 `Released in Version` 分类补足。地区元数据同样优先采用 Wiki 的任务分类；只能由标题识别的条目会标记为推断，无法确认的条目显示“待考证”。Wiki 查询结果缓存于 `public/data/wiki-metadata.json`，外站短暂不可用不会破坏已有目录。

## 打印与 PDF

- A4、A5、Letter；横向或纵向；7–13 pt 字号与 6–24 mm 页边距。
- 双栏、上下、仅中文、仅英文；一般、紧凑、超紧凑三档密度。
- 页眉和页脚各有左、中、右三个槽位，可拖动交换，并可放置内容标题、当前章节、打印时间、网站版本、页码或自定义文字。
- “系统打印”和“直接导出 PDF”共用同一排版结果，避免浏览器原生分页差异。

## 自动更新

- 每次打开目录都会先读取本站快照，再由 `/api/catalog` 在后台检查 Yatta 最新 CHS / EN 任务索引；新增与标题修订会无刷新合并，并显示 Toast 与检查结果。
- Cloudflare 会缓存后台目录数小时，减少对上游资料源的请求。剧情正文继续按需读取，并显示实际接收字节与解析进度。
- GitHub Actions 每天自动运行 `npm run data:update`，有变化时提交新的可追溯数据快照。

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

剧情文本及《原神》相关名称、商标的权利归其各自权利人所有。本项目是非官方、非商业的语言学习与剧情查阅工具，不隶属于或受 HoYoverse / COGNOSPHERE 认可。数据快照来源于 [Project Amber / Yatta](https://gi.yatta.moe/)；[Honey Hunter](https://gensh.honeyhunterworld.com/) 用于交叉核验；版本与地区补充元数据来自 [Genshin Impact Wiki](https://genshin-impact.fandom.com/)。请勿将项目数据用于商业再分发。
