export interface Post {
  id: string;
  title: string;
  url: string;
  score: number;
  commentCount: number;
  author: string;
  createdAt: string;
}

/**
 * Scrape the latest posts from news.hada.io using HTMLRewriter.
 */
export async function scrapeLatestPosts(maxPosts: number = 30): Promise<Post[]> {
  const response = await fetch("https://news.hada.io/", {
    headers: { "User-Agent": "GeekNews-MCP/1.0" },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch news.hada.io: ${response.status}`);
  }

  const posts: Post[] = [];
  let current: Partial<Post> = {};
  let inItem = false;
  let captureTitle = false;
  let captureScore = false;
  let captureComments = false;
  let captureAuthor = false;
  let captureAge = false;

  const rewriter = new HTMLRewriter()
    .on(".topic_row", {
      element(el) {
        // Start of a new post row
        inItem = true;
        current = {};
        const id = el.getAttribute("id");
        if (id) current.id = id;
      },
    })
    .on(".topic_row .topictitle a", {
      element(el) {
        if (!inItem) return;
        const href = el.getAttribute("href");
        if (href) {
          current.url = href.startsWith("http") ? href : `https://news.hada.io${href}`;
        }
        captureTitle = true;
      },
      text(chunk) {
        if (captureTitle) {
          current.title = (current.title ?? "") + chunk.text;
          if (chunk.lastInTextNode) captureTitle = false;
        }
      },
    })
    .on(".topic_row .score", {
      element() {
        if (!inItem) return;
        captureScore = true;
      },
      text(chunk) {
        if (captureScore) {
          const raw = (current as { _scoreRaw?: string })._scoreRaw ?? "";
          (current as { _scoreRaw?: string })._scoreRaw = raw + chunk.text;
          if (chunk.lastInTextNode) {
            const n = parseInt((current as { _scoreRaw?: string })._scoreRaw ?? "0", 10);
            current.score = isNaN(n) ? 0 : n;
            captureScore = false;
          }
        }
      },
    })
    .on(".topic_row .comments_count", {
      element() {
        if (!inItem) return;
        captureComments = true;
      },
      text(chunk) {
        if (captureComments) {
          const raw = (current as { _commRaw?: string })._commRaw ?? "";
          (current as { _commRaw?: string })._commRaw = raw + chunk.text;
          if (chunk.lastInTextNode) {
            const n = parseInt((current as { _commRaw?: string })._commRaw ?? "0", 10);
            current.commentCount = isNaN(n) ? 0 : n;
            captureComments = false;
          }
        }
      },
    })
    .on(".topic_row .by a", {
      element(el) {
        if (!inItem) return;
        const href = el.getAttribute("href") ?? "";
        if (href.startsWith("/user")) captureAuthor = true;
      },
      text(chunk) {
        if (captureAuthor) {
          current.author = (current.author ?? "") + chunk.text;
          if (chunk.lastInTextNode) captureAuthor = false;
        }
      },
    })
    .on(".topic_row .time-ago", {
      element() {
        if (!inItem) return;
        captureAge = true;
      },
      text(chunk) {
        if (captureAge) {
          current.createdAt = (current.createdAt ?? "") + chunk.text;
          if (chunk.lastInTextNode) {
            current.createdAt = current.createdAt?.trim();
            captureAge = false;
          }
        }
      },
    })
    // Detect end of row by the next sibling separator or just collect on each .topic_row close
    .on(".topic_row .subinfo", {
      element() {
        // .subinfo signals we have enough data — flush the current post
        if (inItem && current.title && current.url && posts.length < maxPosts) {
          posts.push({
            id: current.id ?? "",
            title: current.title.trim(),
            url: current.url,
            score: current.score ?? 0,
            commentCount: current.commentCount ?? 0,
            author: current.author?.trim() ?? "",
            createdAt: current.createdAt ?? "",
          });
        }
        inItem = false;
      },
    });

  await rewriter.transform(response).text();

  return posts.slice(0, maxPosts);
}

/**
 * Scrape search results from news.hada.io/search using HTMLRewriter.
 */
export async function scrapeSearchResults(query: string, maxPosts: number = 20): Promise<Post[]> {
  const url = `https://news.hada.io/search?q=${encodeURIComponent(query)}`;
  const response = await fetch(url, {
    headers: { "User-Agent": "GeekNews-MCP/1.0" },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch search results: ${response.status}`);
  }

  const posts: Post[] = [];
  let current: Partial<Post> & { _scoreRaw?: string; _commRaw?: string } = {};
  let inItem = false;
  let captureTitle = false;
  let captureScore = false;
  let captureComments = false;
  let captureAuthor = false;
  let captureAge = false;

  const rewriter = new HTMLRewriter()
    .on(".topic_row", {
      element(el) {
        inItem = true;
        current = {};
        const id = el.getAttribute("id");
        if (id) current.id = id;
      },
    })
    .on(".topic_row .topictitle a", {
      element(el) {
        if (!inItem) return;
        const href = el.getAttribute("href");
        if (href) {
          current.url = href.startsWith("http") ? href : `https://news.hada.io${href}`;
        }
        captureTitle = true;
      },
      text(chunk) {
        if (captureTitle) {
          current.title = (current.title ?? "") + chunk.text;
          if (chunk.lastInTextNode) captureTitle = false;
        }
      },
    })
    .on(".topic_row .score", {
      element() {
        if (!inItem) return;
        captureScore = true;
      },
      text(chunk) {
        if (captureScore) {
          current._scoreRaw = (current._scoreRaw ?? "") + chunk.text;
          if (chunk.lastInTextNode) {
            const n = parseInt(current._scoreRaw ?? "0", 10);
            current.score = isNaN(n) ? 0 : n;
            captureScore = false;
          }
        }
      },
    })
    .on(".topic_row .comments_count", {
      element() {
        if (!inItem) return;
        captureComments = true;
      },
      text(chunk) {
        if (captureComments) {
          current._commRaw = (current._commRaw ?? "") + chunk.text;
          if (chunk.lastInTextNode) {
            const n = parseInt(current._commRaw ?? "0", 10);
            current.commentCount = isNaN(n) ? 0 : n;
            captureComments = false;
          }
        }
      },
    })
    .on(".topic_row .by a", {
      element(el) {
        if (!inItem) return;
        const href = el.getAttribute("href") ?? "";
        if (href.startsWith("/user")) captureAuthor = true;
      },
      text(chunk) {
        if (captureAuthor) {
          current.author = (current.author ?? "") + chunk.text;
          if (chunk.lastInTextNode) captureAuthor = false;
        }
      },
    })
    .on(".topic_row .time-ago", {
      element() {
        if (!inItem) return;
        captureAge = true;
      },
      text(chunk) {
        if (captureAge) {
          current.createdAt = (current.createdAt ?? "") + chunk.text;
          if (chunk.lastInTextNode) {
            current.createdAt = current.createdAt?.trim();
            captureAge = false;
          }
        }
      },
    })
    .on(".topic_row .subinfo", {
      element() {
        if (inItem && current.title && current.url && posts.length < maxPosts) {
          posts.push({
            id: current.id ?? "",
            title: current.title.trim(),
            url: current.url,
            score: current.score ?? 0,
            commentCount: current.commentCount ?? 0,
            author: current.author?.trim() ?? "",
            createdAt: current.createdAt ?? "",
          });
        }
        inItem = false;
      },
    });

  await rewriter.transform(response).text();

  return posts.slice(0, maxPosts);
}
