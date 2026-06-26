import { Link } from "wouter";
import { blogPosts } from "@/data/blog-posts";

export default function Blog() {
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
          <p className="text-muted-foreground mb-8 text-sm sm:text-base max-w-2xl">
            In-depth articles on aviation meteorology, weather reporting, and flight safety.
            Essential knowledge for pilots, dispatchers, and aviation professionals.
          </p>

          <div className="grid gap-6">
            {blogPosts.map((post) => (
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
        </div>
      </main>
    </div>
  );
}
