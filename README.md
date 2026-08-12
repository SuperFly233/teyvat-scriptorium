# 提瓦特剧本室 · Teyvat Scriptorium

原神剧情的中文 / 英文逐句对照阅读器，支持任务与场景选择、搜索、五种阅读模式和四种打印预设。

## 本地运行

```bash
npm install
npm run data:fetch
npm run dev
```

生产构建与检查：

```bash
npm test
npm run build
npm run preview
```

## 更新剧情数据

当前快照为主线章节 `1700`（无神怜爱的雪国 / Everwinter Without Mercy）。运行：

```bash
node scripts/fetch-quest.mjs 1700
```

采集器从 Project Amber / Yatta 的 CHS 与 EN 接口读取结构化数据，按游戏内部 ID 合并。若要加入更多章节，可将生成文件加入 `public/data/manifest.json`，前端的数据选择器可以继续扩展。

## 部署到 Cloudflare Pages

```bash
npm run build
npx wrangler pages deploy ./dist --project-name teyvat-scriptorium
```

## 数据与权利说明

剧情文本及《原神》相关名称、商标的权利归其各自权利人所有。本项目是非官方、非商业的语言学习与剧情查阅工具，不隶属于或受 HoYoverse / COGNOSPHERE 认可。数据快照来源于 [Project Amber / Yatta](https://gi.yatta.moe/)；[Honey Hunter](https://gensh.honeyhunterworld.com/) 用于交叉核验。请勿将本项目的数据快照用于商业再分发。
