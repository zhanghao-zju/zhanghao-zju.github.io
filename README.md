# Personal Homepage

这是一个基于 Astro 的个人主页项目，适合放个人介绍、发表文章和四类写作内容。

## 本地运行

```sh
npm install
npm run dev
```

启动后打开：

```text
http://127.0.0.1:4321/
```

## 常用目录

```text
src/pages/index.astro          首页
src/pages/publications.astro   发表文章
src/pages/about.astro          关于我
src/pages/blog/                写作目录和文章详情页
src/pages/notes/               生活碎碎念入口
src/content/blog/              所有写作 Markdown
src/layouts/BaseLayout.astro   页面布局和全局样式
public/                        头像、CV、图片等静态文件
```

## 写一篇文章

在 `src/content/blog/` 下面新增 Markdown 文件，例如：

```text
src/content/blog/paper-reading-01.md
```

文件开头需要有 frontmatter：

```md
---
title: 文章标题
slug: paper-reading-01
date: 2026-05-31
category: tech-notes
description: 一句话摘要。
---

正文内容写在这里。
```

`category` 有四种：

```text
tech-notes      技术学习笔记
weekly-review   学习总结
lab-log         项目实验记录
life-notes      生活碎碎念
```

`slug` 决定网页地址，例如 `slug: paper-reading-01` 会生成：

```text
/blog/paper-reading-01/
```

写作目录页 `/blog/` 会自动按分类展示这些文章，标题会自动链接到对应详情页。

## 构建检查

```sh
npm run build
```
