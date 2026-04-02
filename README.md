# Academic CV site（静态站）

本目录为纯静态页面，可直接部署到任意静态托管，无需构建步骤。

包含文件：`index.html`、`styles.css`、`cv.js`、`nye-clock-backdrop.html`（背景 WebGL 体积较大，首次打开会加载稍久）。

## 上线步骤（推荐：GitHub + Cloudflare Pages）

1. **新建 GitHub 仓库**（可设为 Public），把本文件夹内全部文件推到仓库**根目录**（保证根目录有 `index.html`）。

2. 打开 [Cloudflare Dashboard](https://dash.cloudflare.com/) → **Workers & Pages** → **Pages** → **Create** → **Connect to Git**，授权并选中该仓库。

3. **构建设置**：
   - **Framework preset:** None
   - **Build command:**（留空）
   - **Build output directory:** `/` 或留空，以界面说明为准（静态根目录即网站根）

4. 保存并部署。完成后会得到 `https://<项目名>.pages.dev` 地址。

5. **自定义域名（可选）**：在该 Pages 项目 → **Custom domains** 里按提示把域名 DNS 指到 Cloudflare。

6. **部署后**：在仓库设置或 Cloudflare 里打开 **自动部署**：每次 `git push` 到默认分支会重新发布。

## 其他托管方式

| 平台 | 做法 |
|------|------|
| **GitHub Pages** | 仓库 → Settings → Pages → Source 选分支与 `/ (root)`，保存后约几分钟可用 `https://<用户>.github.io/<仓库名>/` |
| **Netlify** | Drag-and-drop 本文件夹，或 Connect Git，**Publish directory** 为仓库根目录 |
| **Vercel** | Import Git 仓库，Framework 选 Other，**Root** 为含 `index.html` 的目录 |

## 上线后你可自行修改

- 在 **`index.html`** 里为正式域名添加 `<link rel="canonical" href="https://你的域名/" />` 与 `og:url`（若已添加 Open Graph），有利于搜索引擎与分享预览。

## 隐私说明

页面中的邮箱、电话等为你主动展示的联系信息；若需隐藏某项，直接编辑 `index.html` 后再推送部署。
