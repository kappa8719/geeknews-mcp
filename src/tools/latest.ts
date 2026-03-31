import { scrapeLatestPosts } from "../scraper.js";

export const getLatestPostsTool = {
  name: "get_latest_posts",
  description: "Fetch the latest posts from GeekNews (news.hada.io). Returns title, URL, score, and comment count for recent posts.",
  inputSchema: {
    type: "object" as const,
    properties: {
      limit: {
        type: "number",
        description: "Maximum number of posts to return (1-30, default 10)",
        minimum: 1,
        maximum: 30,
      },
    },
    required: [],
  },
};

export async function handleGetLatestPosts(args: { limit?: number }): Promise<string> {
  const limit = Math.min(Math.max(args.limit ?? 10, 1), 30);
  const posts = await scrapeLatestPosts(limit);

  if (posts.length === 0) {
    return "No posts found. The site structure may have changed.";
  }

  const lines = posts.map((post, i) => {
    const comments = post.commentCount === 1 ? "1 comment" : `${post.commentCount} comments`;
    return [
      `${i + 1}. **${post.title}**`,
      `   URL: ${post.url}`,
      `   Score: ${post.score} | ${comments} | By: ${post.author || "unknown"} | ${post.createdAt || ""}`,
    ].join("\n");
  });

  return `# GeekNews Latest Posts\n\n${lines.join("\n\n")}`;
}
