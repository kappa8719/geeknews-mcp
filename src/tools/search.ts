import { scrapeSearchResults } from "../scraper.js";

export const searchPostsTool = {
  name: "search_posts",
  description: "Search GeekNews (news.hada.io) posts by keyword using the built-in search. Returns matching posts with title, URL, score, and comment count.",
  inputSchema: {
    type: "object" as const,
    properties: {
      query: {
        type: "string",
        description: "Search keyword or phrase",
      },
      limit: {
        type: "number",
        description: "Maximum number of results to return (1-20, default 10)",
        minimum: 1,
        maximum: 20,
      },
    },
    required: ["query"],
  },
};

export async function handleSearchPosts(args: { query: string; limit?: number }): Promise<string> {
  if (!args.query || args.query.trim() === "") {
    throw new Error("query parameter is required and cannot be empty");
  }

  const limit = Math.min(Math.max(args.limit ?? 10, 1), 20);
  const posts = await scrapeSearchResults(args.query.trim(), limit);

  if (posts.length === 0) {
    return `No results found for "${args.query}" on GeekNews.`;
  }

  const lines = posts.map((post, i) => {
    const comments = post.commentCount === 1 ? "1 comment" : `${post.commentCount} comments`;
    return [
      `${i + 1}. **${post.title}**`,
      `   URL: ${post.url}`,
      `   Score: ${post.score} | ${comments} | By: ${post.author || "unknown"} | ${post.createdAt || ""}`,
    ].join("\n");
  });

  return `# GeekNews Search Results for "${args.query}"\n\n${lines.join("\n\n")}`;
}
