export const PAGE_SIZE = 5;

export const CATEGORIES = [
  {
    key: 'lab-log',
    title: '项目实验记录',
  },
  {
    key: 'tech-notes',
    title: '技术学习笔记',
  },
  {
    key: 'weekly-review',
    title: '学习总结',
  },
  {
    key: 'life-notes',
    title: '生活碎碎念',
  },
];

export const categoryLabels = Object.fromEntries(
  CATEGORIES.map((category) => [category.key, category.title]),
);

export const formatDate = (date) => {
  const value = new Date(date);
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const sortPostsByDateDesc = (posts) =>
  posts.sort(
    (a, b) => new Date(b.frontmatter.date).valueOf() - new Date(a.frontmatter.date).valueOf(),
  );
