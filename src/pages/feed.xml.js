import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';

export async function GET(context) {
  const posts = await getCollection('blog', ({ data }) => !data.draft);
  posts.sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());

  return rss({
    title: 'Concrete Comeback',
    description:
      'Practical guides, gear advice, safety tips, and stories for adults 40+ getting back into skateboarding after years away from the sport.',
    site: context.site,
    items: posts.map((post) => ({
      title: post.data.title,
      description: post.data.description,
      pubDate: post.data.pubDate,
      author: post.data.author,
      categories: post.data.tags || [],
      link: `/blog/${post.id}/`,
      customData: post.data.updatedDate
        ? `<lastUpdated>${post.data.updatedDate.toISOString()}</lastUpdated>`
        : undefined,
    })),
    customData: `<language>en-us</language>`,
  });
}
