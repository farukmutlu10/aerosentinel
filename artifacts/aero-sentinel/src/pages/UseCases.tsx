import { Link } from "wouter";
import { useCases } from "@/data/use-cases";

export default function UseCases() {
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
        <div className="max-w-5xl mx-auto px-4 py-8">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
            Use Cases
          </h1>
          <p className="text-muted-foreground text-base sm:text-lg mb-10 max-w-2xl">
            Discover how different aviation professionals and weather enthusiasts use AERO-SENTINEL to stay informed and make better decisions.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {useCases.map((useCase) => (
              <Link
                key={useCase.slug}
                href={`/use-cases/${useCase.slug}`}
                className="group block border border-border rounded-xl p-6 bg-card hover:border-primary/40 hover:shadow-lg transition-all duration-200"
              >
                <div className="text-3xl mb-3">{useCase.icon}</div>
                <h2 className="text-lg font-bold mb-2 group-hover:text-primary transition-colors">
                  {useCase.title}
                </h2>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {useCase.description}
                </p>
                <div className="mt-4 text-xs font-mono font-bold text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                  Read more →
                </div>
              </Link>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
