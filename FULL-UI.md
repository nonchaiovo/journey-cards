# 完整旅行页面 · 2026-10-19

## 本次同步

从 NEST 最新旅行 UI 提取照片画布和故事组件：平移、双指缩放、惯性、视口瓦片裁剪；默认旁白落定并展开，正文最多 42vh 可滚动，点地名重播；照片 Ken Burns 动画；流式 HTMLAudioElement + Web Audio GainNode 压低背景配乐；进度条点击定位；退出故事、切换停留或宿主关闭面板时清理音频。

独立入口另接上旅程管理：创建、编辑标题/年份/整趟配乐、删除旅程，添加/编辑/删除停留、上传或粘贴照片链接、单张及全部折叠。没有灰色 tap 高亮，不添加勾选装饰。

## 本地体验与构建

运行 `python3 -m http.server 8080`，打开 `/journeys/`。默认 `config.js` 的 `demo:true` 将修改留在浏览器 localStorage；清除该站点 `journey-cards-demo-v2` 项可重置。照片是 SVG 占位图；演示不预置音乐或合成语音。浏览器储存容量有限，大量照片应使用真实后端。

React 18.3.1 / ReactDOM 18.3.1 production 已内嵌在 HTML，保留上游许可证头；无需 CDN React 或浏览器 Babel。字体仍可联网获取 Google Fonts，断网会回退系统字体。修改 JSX 后执行 `npm ci && npm run build`，不要只改编译产物。

## 连接真实后端

1. Cloudflare 创建 D1 数据库和 KV，填入 `wrangler.toml` 对应 ID。
2. 新库执行 `npx wrangler d1 execute journey-cards --remote --file=schema.sql`。旧库已遵守原 SPEC 时无需迁移。
3. `npx wrangler secret put AUTH_TOKEN` 设置服务端 token。
4. 把 `journeys/config.js` 的 `demo` 改为 false。API 同源时 `apiBase` 留空；异源时配置真实地址和服务端 ALLOW_ORIGIN。token 应由宿主在运行时注入，不能把真实值提交到公开仓库。
5. `npx wrangler deploy` 同时发布静态页面与 `/api/*` 后端。

音频沿用公开契约 `audio.url` / `song.url`（GET 返回兼容别名），编辑时提交 `audioUrl` 和 `audioTitle`。使用自有可播放音频链接，跨域音频服务器须允许 CORS，否则 Web Audio 可能静音。音频时长加载后使用真实 duration，之前使用数据值。也可使用原接口 `POST /api/journeys/audio` 上传后写入返回的媒体引用。公开版本不绑定网易云搜索/代理；没有音频 URL 时隐藏播放器。照片/音频默认沿用原后端公开媒体模型，详见 SPEC 的鉴权说明。

可选 TTS：配置同 API 基址下的 `ttsEndpoint` 路径，例如 `/api/tts`；宿主实现 `POST {text}`，返回 `{voice:{audio_data_url,duration}}`。示例 Worker 不含语音供应商，未配置时逐字动画仍可用。原 NEST 的私人角色与 Fish 配置不随包发布。

## 宿主嵌入

推荐 iframe 隔离全局 CSS。页面默认照片画布，`#manage` 为管理页。同源宿主可向 iframe 发送 `{type:"journeys:refresh"}` 刷新和 `{type:"journeys:stop-audio"}` 停止/退出故事；页面返回时发送 `{type:"journeys:close"}`。跨域宿主须在源码中明确配置允许的 origin 后再接消息。

聊天卡片入口继续使用 `examples/journey-cards.html` 和 INTEGRATE.md；AI 写入顺序见 AI-GUIDE.md。只有 `<journey>` 标签或成功的写入交付才应产生旅行卡片；GET 回看旅行不应把普通回复变成旅行旁白。

## 验证范围

`npm test` 覆盖演示 CRUD、音频字段兼容、存储恢复及后端错误传播。浏览器检查画布、管理入口、停留折叠和故事退出。实体 iPhone 的音频解锁、第三方音频 CORS 和自备 TTS 需在接入环境复测；这次不部署私人 NEST 服务。

本目录与整个仓库遵守 LICENSE（非商用、署名、禁止再开源分发）；第三方 React 继续遵守其自身 MIT 许可。
