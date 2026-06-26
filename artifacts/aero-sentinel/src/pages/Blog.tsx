import { useState } from "react";
import { Link } from "wouter";
import { blogPosts } from "@/data/blog-posts";
import { Skeleton } from "@/components/ui/skeleton";

export default function Blog() {
  const [search, setSearch] = useState("");

  const filtered = blogPosts.filter((post) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      post.title.toLowerCase().includes(q) ||
      post.description.toLowerCase().includes(q) ||
      post.tags.some((t) => t.toLowerCase().includes(q))
    );
  });

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border px-4 py-3 flex items-center gap-3 shrink-0">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm font-mono font-bold text-muted-foreground hover:text-foreground transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5"/>
            <polyline points="12 19 5 12 12 5"/>
          </svg>
          Back to Dashboard
        </Link>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-4 py-8">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-2">
            Aviation Weather Guides
          </h1>
          <p className="text-muted-foreground mb-6 text-sm sm:text-base max-w-2xl">
            In-depth articles on aviation meteorology, weather reporting, and flight safety.
            Essential knowledge for pilots, dispatchers, and aviation professionals.
          </p>

          {/* Search */}
          <div className="relative mb-6">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search articles..."
              className="w-full h-10 pl-9 pr-4 rounded-lg text-xs font-mono border border-border bg-card transition-colors focus:outline-none focus:border-primary"
            />
            {search && (
              <button onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors text-sm leading-none">
                ×
              </button>
            )}
          </div>

          {filtered.length === 0 ? (
            <div className="bg-card border border-border rounded-xl p-8 sm:p-12 text-center space-y-3">
              <div className="w-12 h-12 mx-auto rounded-full bg-muted/30 border border-border flex items-center justify-center">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground">
                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
              </div>
              <div>
                <p className="text-sm font-mono font-bold text-foreground">No articles found matching your search</p>
                <p className="text-xs font-mono text-muted-foreground mt-1">Try different keywords or browse all articles.</p>
              </div>
              {search && (
                <button onClick={() => setSearch("")} className="px-4 py-2 text-xs font-mono font-bold rounded-lg border border-primary/40 text-primary hover:bg-primary/10 transition-colors">
                  Clear Search
                </button>
              )}
            </div>
          ) : (
          <div className="grid gap-6">
            {filtered.map((post) => (
              <Link
                key={post.slug}
                href={`/blog/${post.slug}`}
                className="group block border border-border/60 rounded-xl p-5 sm:p-6 hover:border-sky-500/40 hover:bg-sky-500/[0.03] transition-all duration-200"
              >
                <div className="flex flex-col gap-2">
                  <h2 className="text-lg sm:text-xl font-semibold text-foreground group-hover:text-sky-400 transition-colors leading-snug">
                    {post.title}
                  </h2>
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    {post.description}
                  </p>
                  <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground/60 font-mono">
                    <span>{post.date}</span>
                    <span className="w-1 h-1 rounded-full bg-muted-foreground/30" />
                    <span>{post.readTime}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {post.tags.map((tag) => (
                      <span
                        key={tag}
                        className="text-[10px] font-mono font-bold tracking-wider px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/20"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </Link>
            ))}
          </div>
          )}
        </div>
      </main>
    </div>
  );
}
