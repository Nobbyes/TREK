# TREK · 秋游中亚 2026

两人同行，2026 年 9 月 25 日至 10 月 6 日。12 个自然日、10 晚酒店、1 晚机上。

塔什干 → 撒马尔罕 → 布哈拉 → 希瓦 → 努库斯 → 阿克套；去程重庆会合，返程奇姆肯特转机至上海。

## 页面

- 真实城市方位的交互地图：总览显示完整路线，选择城市后只显示该城市及当地收藏标记。
- 12 天等高行程日历，上午、下午、晚上分别展示。
- 航班号、车次、当地出发及到达时间；点击查看完整安排。
- 12 个日期二级目录与 64 项精确待办，包含 79 个 Google Maps 地点入口。
- 登录成员可编辑行程日历，也可修改、新增、删除和调整待办顺序；完成进度与内容由协作后台同步保存。
- 六地酒店与地图查询入口。
- [Google Maps 收藏地点原清单](https://maps.app.goo.gl/JQUJwBDUwqy2TfQP9)；[最新清单](https://maps.app.goo.gl/y1Kww3mHPbMZbS1c8)。最新清单已导入 98 个地点；每个地点均展示用途介绍、建议停留、行前提示、住宿距离、当前安排、原备注和精确坐标 Google Maps 入口。
- 地图标记按密度聚合，并与地点卡片双向定位；登录成员可从地点卡片直接安排到某日的日历或待办。

## 资料与更新

行程资料来自用户的 Notion 行程、《【大合辑】秋游中亚》以及本次对话中的票务截图。票务时间以最新截图为准；旧对话中的候选活动不视作预订。

`data.js` 是页面的默认行程数据。配置协作后台后，网站优先读取云端版本；云端不可用时仍会显示默认行程。不在网站、仓库或提交历史中写入订单号、票号或 Supabase `service_role` 密钥。

## 登录与共同编辑

网站支持“公开浏览、受邀邮箱账号编辑”：

- 未登录访客只能查看。
- 白名单成员以账号和密码登录后，可在网页中编辑每日安排、待办清单、交通、城市和住宿；当前简写账号会在后台映射到 Supabase 登录标识。
- 保存前会检查云端版本；如果另一位成员已经更新，会要求刷新，避免静默覆盖。
- 前端只使用可公开的 Supabase publishable key，真正的写入权限由数据库 RLS 控制。

首次启用：

1. 在 Supabase 新建项目，在 SQL Editor 运行 `supabase-setup.sql`。
2. 在 Authentication → Users 创建或邀请编辑成员。
3. 在 Table Editor 的 `trek_editors` 表加入每位成员的邮箱。
4. 将 Project URL 和 publishable key 填入 `backend-config.js`。绝不能填入 `service_role` secret key。
5. 首位编辑者登录网站并保存一次，当前默认行程会写入云端。

## 本地查看

直接打开 `index.html`。页面交互与日历不需服务器，地图底图和照片需要网络连接。

## GitHub Pages

仓库包含 `.github/workflows/pages.yml`。推送到 `main` 后会自动构建并发布 GitHub Pages；首次使用时在仓库 Settings → Pages → Build and deployment 中将 Source 设为 GitHub Actions。具体部署地址以 Pages 页面给出的 URL 为准。

部署地址应以 Pages 页面给出的 URL 为准；仅创建仓库不代表网站已发布。

## 地图说明

使用 Leaflet 1.9.4 和 OpenStreetMap。城市间连线只表示行程先后和大致方向，不是实际铁路、道路或航线轨迹，不用于导航。阿克套在里海东岸，努库斯至阿克套不需要跨越里海。

## 图片与第三方许可

- 雷吉斯坦照片：Ekrem Canli / Wikimedia Commons / [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/)，展示时裁切为 16:9。[来源](https://commons.wikimedia.org/wiki/File:Registan_square_Samarkand.jpg)。
- Leaflet：BSD-2-Clause，见 `vendor/leaflet-LICENSE`。
- Leaflet.markercluster 1.4.1：MIT，见 `vendor/leaflet-markercluster-LICENSE`。
- Lucide：ISC，见 `vendor/lucide-LICENSE`。
- 底图：[© OpenStreetMap contributors](https://www.openstreetmap.org/copyright)。不缓存或批量下载地图瓦片。

