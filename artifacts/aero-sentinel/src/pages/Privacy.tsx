import { Link } from "wouter";

export default function Privacy() {
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
      <div className="max-w-3xl mx-auto px-4 py-8">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-2">
          Privacy Policy
        </h1>
        <p className="text-xs text-muted-foreground mb-8">
          Last updated: June 26, 2026
        </p>

        <div className="space-y-6 text-muted-foreground leading-relaxed text-sm sm:text-base">
          <p>
            AERO-SENTINEL ("we", "us", or "our") operates the
            aerosentinel.app website. This Privacy Policy explains how we
            collect, use, disclose, and safeguard your information when you
            visit our website and use our services.
          </p>

          <h2 className="text-xl font-semibold text-foreground pt-4">
            1. Information We Collect
          </h2>
          <p>
            We may collect information about you in various ways, including:
          </p>
          <ul className="list-disc list-inside space-y-2 ml-4">
            <li>
              <strong className="text-foreground">ICAO Airport Codes:</strong>{" "}
              When you add airports to your watchlist, we store ICAO four-letter
              airport identifiers (e.g., KJFK, EGLL) in your browser's local
              storage. This data never leaves your device.
            </li>
            <li>
              <strong className="text-foreground">User Preferences:</strong> Your
              theme selection (dark/light mode), notification preferences, and
              acknowledged alert states are stored locally in your browser.
            </li>
            <li>
              <strong className="text-foreground">Device and Usage Data:</strong>{" "}
              We automatically collect certain information when you visit our
              website, including your IP address, browser type, operating
              system, referring URLs, pages visited, time spent on pages, and
              other diagnostic data. This information is collected through
              Google Analytics.
            </li>
            <li>
              <strong className="text-foreground">
                Notification Tokens:
              </strong>{" "}
              If you opt in to browser push notifications, a device-specific
              token is generated and stored locally to deliver alerts. This
              token does not identify you personally.
            </li>
          </ul>

          <h2 className="text-xl font-semibold text-foreground pt-4">
            2. How We Use Your Information
          </h2>
          <p>We use the information we collect for the following purposes:</p>
          <ul className="list-disc list-inside space-y-2 ml-4">
            <li>
              To provide real-time aviation weather alerts and notifications
              based on your watchlist preferences.
            </li>
            <li>
              To analyze website usage patterns and improve user experience
              through Google Analytics.
            </li>
            <li>
              To serve relevant advertisements through Google AdSense.
            </li>
            <li>
              To detect and prevent fraud, abuse, or security threats.
            </li>
            <li>
              To comply with legal obligations.
            </li>
          </ul>

          <h2 className="text-xl font-semibold text-foreground pt-4">
            3. Cookies and Tracking Technologies
          </h2>
          <p>
            Our website uses cookies and similar tracking technologies to
            enhance your experience:
          </p>
          <ul className="list-disc list-inside space-y-2 ml-4">
            <li>
              <strong className="text-foreground">Google Analytics:</strong> We
              use Google Analytics to understand how visitors interact with our
              website. Google Analytics uses cookies to collect information
              such as how often users visit the site, what pages they visit,
              and what other sites they used prior to coming to our site. You
              can opt out by installing the{" "}
              <a
                href="https://tools.google.com/dlpage/gaoptout"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sky-400 hover:text-sky-300 underline"
              >
                Google Analytics Opt-Out Browser Add-on
              </a>
              .
            </li>
            <li>
              <strong className="text-foreground">Google AdSense:</strong> We use
              Google AdSense to display advertisements. Google AdSense uses
              cookies to serve ads based on your prior visits to our website
              and other websites. You can manage ad personalization through
              Google's{" "}
              <a
                href="https://adssettings.google.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sky-400 hover:text-sky-300 underline"
              >
                Ads Settings
              </a>
              .
            </li>
            <li>
              <strong className="text-foreground">Essential Cookies:</strong>{" "}
              Local storage is used to persist your theme preference and
              application state. These are necessary for the website to
              function properly.
            </li>
          </ul>

          <h2 className="text-xl font-semibold text-foreground pt-4">
            4. Third-Party Services
          </h2>
          <p>
            We employ the following third-party services that may collect
            information about you:
          </p>
          <ul className="list-disc list-inside space-y-2 ml-4">
            <li>
              <strong className="text-foreground">Google Analytics</strong> —
              Website analytics (Google LLC)
            </li>
            <li>
              <strong className="text-foreground">Google AdSense</strong> —
              Advertising (Google LLC)
            </li>
            <li>
              <strong className="text-foreground">Cloudflare</strong> — Content
              delivery and website hosting (Cloudflare, Inc.)
            </li>
          </ul>
          <p>
            Each of these third-party services has its own privacy policy
            governing the use of your information. We encourage you to review
            their respective privacy policies.
          </p>

          <h2 className="text-xl font-semibold text-foreground pt-4">
            5. Data Retention
          </h2>
          <p>
            Your watchlist data, preferences, and alert history are stored
            entirely in your browser's local storage and are never transmitted
            to our servers. You may clear this data at any time through your
            browser settings. Google Analytics data is retained in accordance
            with Google's default retention policies.
          </p>

          <h2 className="text-xl font-semibold text-foreground pt-4">
            6. Your Rights (CCPA / GDPR)
          </h2>
          <p>
            Depending on your jurisdiction, you may have the following rights:
          </p>
          <ul className="list-disc list-inside space-y-2 ml-4">
            <li>
              <strong className="text-foreground">Right to Access:</strong> You
              can request a copy of the personal data we hold about you.
            </li>
            <li>
              <strong className="text-foreground">Right to Delete:</strong> You
              can request that we delete your personal data.
            </li>
            <li>
              <strong className="text-foreground">Right to Opt-Out:</strong> You
              can opt out of personalized advertising by visiting Google's Ads
              Settings or by using browser-based ad blocking tools.
            </li>
            <li>
              <strong className="text-foreground">Right to Data Portability:</strong>{" "}
              You may request your data in a commonly used, machine-readable
              format.
            </li>
          </ul>
          <p>
            Since most user data (watchlists, preferences) is stored locally in
            your browser and never transmitted to us, exercising these rights
            primarily involves clearing your local browser data or opting out of
            Google Analytics and AdSense tracking.
          </p>

          <h2 className="text-xl font-semibold text-foreground pt-4">
            7. Children's Privacy
          </h2>
          <p>
            Our services are not directed to individuals under the age of 13. We
            do not knowingly collect personal information from children under 13.
            If we become aware that we have collected personal data from a child
            under 13, we will take steps to delete that information promptly.
          </p>

          <h2 className="text-xl font-semibold text-foreground pt-4">
            8. Changes to This Policy
          </h2>
          <p>
            We may update this Privacy Policy from time to time. Any changes
            will be posted on this page with an updated revision date. We
            encourage you to review this policy periodically to stay informed
            about how we protect your information.
          </p>

          <h2 className="text-xl font-semibold text-foreground pt-4">
            9. Contact Us
          </h2>
          <p>
            If you have any questions or concerns about this Privacy Policy,
            please contact us at{" "}
            <a
              href="mailto:contact@aerosentinel.app"
              className="text-sky-400 hover:text-sky-300 underline"
            >
              contact@aerosentinel.app
            </a>
            .
          </p>
        </div>

        {/* Cookie Types Table */}
        <div className="mt-10 p-4 bg-card border border-border rounded-lg">
          <h3 className="text-sm font-mono font-bold text-foreground mb-3">Cookie Types We Use</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 pr-4 text-muted-foreground font-bold">Cookie Type</th>
                  <th className="text-left py-2 pr-4 text-muted-foreground font-bold">Purpose</th>
                  <th className="text-left py-2 text-muted-foreground font-bold">Duration</th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                <tr className="border-b border-border/50">
                  <td className="py-2 pr-4 text-foreground">🔒 Necessary</td>
                  <td className="py-2 pr-4">Required for site functionality (theme, state)</td>
                  <td className="py-2">Session</td>
                </tr>
                <tr className="border-b border-border/50">
                  <td className="py-2 pr-4 text-foreground">📊 Analytics</td>
                  <td className="py-2 pr-4">Usage analytics via Google Analytics (GA4)</td>
                  <td className="py-2">13 months</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4 text-foreground">📢 Marketing</td>
                  <td className="py-2 pr-4">Personalized advertisements (Google AdSense)</td>
                  <td className="py-2">13 months</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Manage Cookie Preferences */}
        <div className="mt-4 p-4 bg-card border border-border rounded-lg">
          <h3 className="text-sm font-mono font-bold text-foreground mb-2">Cookie Preferences</h3>
          <p className="text-xs text-muted-foreground font-mono mb-3">
            You can change your cookie preferences at any time. Click the button below to manage your consent.
          </p>
          <button
            onClick={() => {
              localStorage.removeItem("aero-cookie-consent");
              window.location.reload();
            }}
            className="px-4 py-2 text-xs font-mono font-bold rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
          >
            Manage Cookie Preferences
          </button>
        </div>

        <div className="mt-6 flex flex-wrap gap-4 text-sm">
          <Link
            href="/about"
            className="text-sky-400 hover:text-sky-300 transition-colors underline underline-offset-4"
          >
            About
          </Link>
          <Link
            href="/terms"
            className="text-sky-400 hover:text-sky-300 transition-colors underline underline-offset-4"
          >
            Terms of Service
          </Link>
        </div>
      </div>
      </main>
    </div>
  );
}
