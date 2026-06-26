import { Link, useParams } from "wouter";
import { getUseCaseBySlug } from "@/data/use-cases";
import { Footer } from "@/components/Footer";

export default function UseCaseDetail() {
  const params = useParams();
  const slug = params.slug as string;
  const useCase = getUseCaseBySlug(slug);

  if (!useCase) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
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
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-2xl font-bold mb-2">Use Case Not Found</h1>
            <p className="text-muted-foreground mb-6">The use case you're looking for doesn't exist.</p>
            <Link href="/use-cases" className="text-primary font-mono font-bold text-sm hover:underline">
              ← Browse All Use Cases
            </Link>
          </div>
        </main>
      </div>
    );
  }

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
        <article className="max-w-3xl mx-auto px-4 pt-8 pb-24 sm:pb-8">
          {/* Breadcrumb */}
          <div className="mb-6">
            <Link href="/use-cases" className="text-xs font-mono font-bold text-primary hover:underline">
              ← All Use Cases
            </Link>
          </div>

          {/* Title */}
          <div className="flex items-center gap-3 mb-6">
            <span className="text-4xl">{useCase.icon}</span>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
              {useCase.title}
            </h1>
          </div>

          {/* Description */}
          <p className="text-lg text-muted-foreground mb-8 leading-relaxed">
            {useCase.description}
          </p>

          {/* Content */}
          <div
            className="prose prose-neutral dark:prose-invert max-w-none
              prose-headings:font-bold prose-headings:tracking-tight
              prose-h2:text-xl prose-h2:mt-8 prose-h2:mb-4
              prose-h3:text-lg prose-h3:mt-6 prose-h3:mb-3
              prose-p:text-muted-foreground prose-p:leading-relaxed
              prose-strong:text-foreground
              prose-li:text-muted-foreground
              prose-a:text-primary prose-a:no-underline hover:prose-a:underline"
            dangerouslySetInnerHTML={{ __html: useCase.content }}
          />
        </article>
      </main>

      <Footer />
    </div>
  );
}
