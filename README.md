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
```

## 写文章放哪里

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
