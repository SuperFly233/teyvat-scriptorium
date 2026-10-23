# 按语言复制格式 · v0.10.1

默认使用语言预设，保留“统一格式”。中文、繁中与日文使用全角冒号；英文、德文等使用半角冒号和空格；法文使用不换行空格、半角冒号和空格。这些是台词名字前缀的可编辑预设，不更改正文原有标点，也不宣称覆盖所有文本体裁。

“按语言单独设置”允许分别覆盖名字开关与分隔符。优先级：单独设置 > 总体设置。名字开关的默认值继承总体设置；分隔符默认继承语言预设或统一格式。旁白、空名字及缺失翻译继续原样处理，不添加多余分隔符。恢复默认会清空单独设置。

原存储键继续使用。旧默认全角冒号升级为按语言适配，非默认自定义分隔符迁移为统一格式，保留顺序、换行及其他设置。新配置严格校验语言代码、字段类型与长度。

依据：[Microsoft 英文标点清单](https://learn.microsoft.com/en-us/style-guide/checklists/punctuation-checklist)、[OQLF 法文冒号用法](https://vitrinelinguistique.oqlf.gouv.qc.ca/23325/la-ponctuation/deux-points/emplois-courants-du-deux-points)、[W3C 日文排版](https://www.w3.org/2007/02/japanese-layout/docs/aligned/japanese-layout-requirements-en.html)。

验证：各语言默认、单独覆盖、总体隐藏时单语显示、空分隔符、旧设置迁移、异常配置单元测试；真实剪贴板、刷新持久化、恢复默认、桌面与手机滚动截图；正式域名验证。发布继续保留两份原有本地数据改动。
