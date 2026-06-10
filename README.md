# 张浩的个人主页

这是一个基于 Astro 的个人主页项目，用来维护个人介绍、项目展示和长期写作内容。

网站本地地址：

```text
http://127.0.0.1:4321/
```

线上地址：

```text
https://zhanghao-zju.github.io/
```

## 常用目录

```text
src/pages/index.astro                  首页
src/pages/projects.astro               项目页
src/pages/blog/index.astro             文章目录页
src/pages/blog/[slug].astro            文章详情页
src/pages/about.astro                  关于我
src/content/blog/                      所有文章 Markdown
src/lib/writing.js                     写作分类、分页数量、日期格式
src/layouts/BaseLayout.astro           全站布局和样式
public/avatar.jpg                      导航头像
public/favicon.jpg                     浏览器标签页图标
public/images/                         文章图片
public/images/home/                    首页配图
```

## 首页怎么维护

首页文件在：

```text
src/pages/index.astro
```

### 代表文章是怎么选出来的

首页的“代表文章”优先读取 `featuredSlugs`：

```js
const featuredSlugs = [];
```

如果 `featuredSlugs` 是空数组，首页会自动展示最新的 3 篇文章。

如果你以后想固定指定几篇代表文章，就把文章的 `slug` 写进去：

```js
const featuredSlugs = ['qnn1', 'weekly-review01', 'tech-note-example'];
```

这些 `slug` 来自每篇 Markdown 文章开头的 frontmatter：

```md
---
title: 如何理解 QNN 参数化量子电路
slug: qnn1
date: 2026-06-02
category: tech-notes
---
```

指定后，首页会按 `featuredSlugs` 里的顺序展示，而不是按日期自动排序。

### 最新文章模块怎么更新

首页的“最新文章”模块会自动读取：

```text
src/content/blog/
```

然后按照文章 frontmatter 里的 `date` 从新到旧排序，展示最新 5 篇。

也就是说，你只需要在 Markdown 里正确写日期：

```md
date: 2026-06-04
```

不需要手动修改“最新文章”列表。

### 首页图怎么更换

首页右侧目前是 CSS 生成的简洁配图。如果以后想换成自己的图片，建议把图片放在：

```text
public/images/home/
```

例如：

```text
public/images/home/hero.png
```

然后打开：

```text
src/pages/index.astro
```

把：

```js
const heroImage = '';
```

改成：

```js
const heroImage = '/images/home/hero.png';
```

注意路径从 `/images/...` 开始，不要写 `/public/images/...`。

## 项目页面怎么维护

项目页文件在：

```text
src/pages/projects.astro
```

每一个项目卡片对应 `projects` 数组里的一个对象：

```js
{
  title: '项目中文名',
  summary: '一句话简介。',
  tags: ['标签1', '标签2'],
  links: [
    { label: '项目实验记录', href: '/blog/你的文章slug/' },
    { label: 'GitHub', href: 'https://github.com/zhanghao-zju/你的项目仓库' },
  ],
}
```

以后做完一个项目，推荐流程是：

1. 先在 `src/content/blog/` 写一篇 `category: lab-log` 的项目实验记录文章。
2. 给这篇文章设置清楚的 `slug`，例如 `mnist-qnn-lab`。
3. 在 `src/pages/projects.astro` 的 `projects` 数组里复制一个项目对象。
4. `title` 写项目中文名。
5. `summary` 写一句话简介。
6. 第一个链接写项目实验记录文章地址：`/blog/mnist-qnn-lab/`。
7. 第二个链接写这个项目的 GitHub 仓库地址。

目前项目卡片不会自动从项目实验记录文章生成。原因是项目页需要“项目中文名、简介、GitHub 仓库、相关文章链接”这些结构化信息，而普通 Markdown 文章现在只保存了 `title / slug / date / category`。

如果以后想自动生成，可以给项目实验记录文章增加额外 frontmatter，例如：

```md
---
title: QNN 实现 MNIST01 分类学习
slug: mnist-qnn-lab
date: 2026-06-04
category: lab-log
project:
  name: QNN 手写数字分类
  summary: 使用参数化量子电路完成 MNIST 0/1 分类实验。
  github: https://github.com/zhanghao-zju/xxx
---
```

然后再改 `src/pages/projects.astro`，让它读取这些带 `project` 字段的文章自动生成卡片。现在为了简单稳定，项目卡片先采用手动维护。

## 文章页面和分页逻辑

文章目录页文件在：

```text
src/pages/blog/index.astro
```

分类分页页文件在：

```text
src/pages/blog/[category]/[page].astro
```

分页配置在：

```text
src/lib/writing.js
```

当前每个专栏每页显示 5 篇：

```js
export const PAGE_SIZE = 5;
```

分页逻辑不需要你手动建文件夹，也不需要你手动创建第 1 页、第 2 页。你只需要持续往：

```text
src/content/blog/
```

添加 Markdown 文章。Astro 构建时会自动按分类和页码生成对应页面。

如果某个专栏有 13 篇文章，且 `PAGE_SIZE = 5`，就会自动分成 3 页。

## 关于页面怎么维护

关于页文件在：

```text
src/pages/about.astro
```

“个人信息”“项目名称”“获奖与证书”这些卡片现在都是写在这个前端页面里的静态内容。它们不是 Markdown 自动生成的。

个人信息卡片在这一段附近修改：

```astro
<h2>个人信息</h2>
<ul class="info-list">
  <li><strong>姓名</strong><span>张浩</span></li>
  <li><strong>教育经历</strong><span>2021-2025 南京理工大学</span></li>
  <li><strong>当前状态</strong><span>2026-至今 浙江大学</span></li>
</ul>
```

获奖与证书卡片在这一段附近修改：

```astro
<h2>获奖与证书</h2>
<ul class="info-list">
  <li><strong>奖项名称</strong><span>获奖时间或说明</span></li>
</ul>
```

如果以后获奖很多，可以继续复制 `<li>...</li>` 新增一行。

## 写文章格式、放哪里

所有文章都放在：

```text
src/content/blog/
```

新建一个 `.md` 文件，例如：

```text
src/content/blog/qnn-note-02.md
```

文章开头必须写 frontmatter：

```md
---
title: 文章标题
slug: qnn-note-02
date: 2026-06-04
category: tech-notes
---

正文从这里开始写。
```

`slug` 是文章网址的一部分，例如：

```text
https://zhanghao-zju.github.io/blog/qnn-note-02/
```

`category` 只能使用下面四种之一：

```text
lab-log         项目实验记录
tech-notes      技术学习笔记
weekly-review   学习总结
life-notes      生活碎碎念
```

文章目录会自动按 `category` 分类，并按 `date` 从新到旧排序。每个专栏每页显示 5 篇文章，分页数量在这里改：

```text
src/lib/writing.js
```

```js
export const PAGE_SIZE = 5;
```

## 图片放哪里

文章图片建议统一放在：

```text
public/images/
```

当前已经按文章类型建好目录：

```text
public/images/
├─ lab-log/
├─ life-notes/
├─ tech-notes/
└─ weekly-review/
```

例如图片放在：

```text
public/images/tech-notes/qnn-circuit.png
```

Markdown 里这样引用：

```md
![QNN 电路示意图](/images/tech-notes/qnn-circuit.png)
```

注意：

- 不要写本地绝对路径，例如 `/Users/zhanghao/Desktop/a.png`。
- `public/` 目录会成为网站根目录，所以路径从 `/images/...` 开始。
- 图片文件也要一起 `git add`，否则线上不会显示。

## 写完文章后怎么预览

进入项目目录：

```sh
cd /Users/zhanghao/code/personal-homepage
```

启动本地服务：

```sh
npm run dev
```

打开文章目录：

```text
http://127.0.0.1:4321/blog/
```

或者直接打开某篇文章：

```text
http://127.0.0.1:4321/blog/你的slug/
```

如果页面没有刷新，浏览器里按：

```text
Cmd + Shift + R
```

## 发布到 GitHub Pages

先构建检查：

```sh
npm run build
```

如果构建成功，再提交并推送：

```sh
git status
git add .
git commit -m "Add new article"
git push personal-homepage main
```

GitHub Actions 会自动部署。部署状态看这里：

```text
https://github.com/zhanghao-zju/zhanghao-zju.github.io/actions
```

部署成功后访问：

```text
https://zhanghao-zju.github.io/
```

## 支持哪些笔记格式

当前网站直接支持：

```text
.md Markdown 文件
```

也就是说，文章应该写成 Markdown，放进：

```text
src/content/blog/
```

Word 文档 `.docx` 不能直接作为网页文章渲染。可以这样处理：

- 推荐：把 Word 内容转换成 Markdown，再放进 `src/content/blog/`。
- 如果只是提供下载：把 `.docx` 放到 `public/files/`，然后在 Markdown 里链接它。

例如：

```text
public/files/my-report.docx
```

Markdown 里写：

```md
[下载 Word 报告](/files/my-report.docx)
```

PDF 也类似，可以放到：

```text
public/files/
```

然后作为下载或预览链接使用。

## 代码片段能不能显示

可以。Markdown 里用代码块：

````md
```python
def hello():
    print("hello")
```
````

Astro 会正常渲染代码块，并带基础代码高亮。

## 数学公式能不能显示

可以。项目已经配置了 `remark-math`、`rehype-katex` 和 KaTeX 样式，网页端会把 Markdown 里的 LaTeX 公式渲染成正式数学公式。

行内公式写法：

```md
参数更新可以写成 $\theta_{t+1} = \theta_t - \eta \nabla L(\theta_t)$。
```

块级公式写法：

```md
$$
E = mc^2
$$
```

如果你在 VS Code 里预览 Markdown 时也想看到接近网页端的公式效果，可以安装支持 KaTeX / LaTeX 的 Markdown 预览插件，比如 `Markdown Preview Enhanced`。最终以本地网页预览 `npm run dev` 的效果为准。

## 常用维护命令

```sh
# 启动本地预览
npm run dev

# 构建检查
npm run build

# 查看本地修改
git status

# 提交并推送
git add .
git commit -m "Update site"
git push personal-homepage main
```
