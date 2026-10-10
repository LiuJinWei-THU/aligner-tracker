# 牙套计时 🦷

记录隐形牙套每日佩戴时长的纯静态 PWA（无后端、零依赖、可离线使用）。
目标场景：每天需佩戴 22 小时以上，摘下/戴上时点一下按钮，自动统计与可视化。

## 功能

- **今天**：超大按钮一键记录摘下/戴上（误点可撤销）；今日已佩戴时长进度环；"今天还能摘多久"提醒；本次状态计时、今日摘下次数
- **统计**：四档视图——**近 7 天 / 近 30 天 / 按周 / 按月**。日视图含每日佩戴柱状图（22 小时目标线）与每日摘戴时间线；周/月视图按周一/自然月聚合，展示平均每天佩戴时长（点击柱子查看该周/该月的达标天数、总时长）；汇总卡片显示平均佩戴、达标天数、连续达标、达标率
- **记录**：按天分组的完整事件列表，支持补录、修改、删除；数据导出/导入 JSON 备份；每日目标可调（默认 22 小时）
- **界面**：移动端优先，自动适配系统**深色模式**；柱状图切换时有入场动画
- **统计口径**：未佩戴时长按"摘下→戴上"事件对计算，跨午夜自动按自然日切分；忘记按导致的连续同类事件自动忽略并标记；无任何事件时默认"正在佩戴"

## 在手机上使用（推荐）

1. 部署到 GitHub Pages（见下）
2. 安卓 Chrome 打开网站地址
3. 菜单 → **添加到主屏幕**，之后像 app 一样全屏离线使用（数据存于浏览器 localStorage）

## 部署到 GitHub Pages

```bash
# 1. 在 GitHub 新建一个仓库（如 aligner-tracker），然后：
git remote add origin https://github.com/<你的用户名>/aligner-tracker.git
git push -u origin main

# 2. 仓库 Settings → Pages → Source 选 main 分支 / root，保存
# 3. 稍等片刻，访问 https://<你的用户名>.github.io/aligner-tracker/
```

> 注意：本仓库已按 GitHub Pages 项目子路径优化（全部使用相对路径），无需额外配置。

## 本地开发与测试

```bash
# 起本地服务器（Service Worker 需要 http 环境）
python -m http.server 8971
# 打开 http://127.0.0.1:8971/

# 单元测试（统计逻辑 23 个用例）
# 打开 http://127.0.0.1:8971/tests/tests.html

# 重新生成图标
python tools/make_icons.py   # 需要 Pillow
```

## 数据与隐私

所有数据仅保存在你手机浏览器的 localStorage 中，不上传任何服务器。
**清除浏览器数据、卸载"添加到主屏幕"的应用前，请先在"记录 → 数据备份"里导出 JSON**；换手机时导入即可迁移。

## 文件结构

```
index.html          # 单页应用（今天/统计/记录 三个页签）
css/style.css       # 移动端样式
js/storage.js       # localStorage 数据层
js/stats.js         # 佩戴时长统计核心（纯函数，可单测）
js/charts.js        # SVG 柱状图/时间线/进度环
js/app.js           # 页面逻辑、编辑补录、导入导出
manifest.json       # PWA 清单
sw.js               # Service Worker（离线缓存）
icons/              # 应用图标（192/512）
tests/tests.html    # 统计逻辑单元测试
tools/make_icons.py # 图标生成脚本
```

## 发版更新

修改代码后，把 `sw.js` 顶部的 `CACHE = 'aligner-v1'` 版本号 +1（如 `aligner-v2`），
推送到 GitHub 即可，用户手机上的缓存会自动刷新。
