import { Link } from "wouter";

export default function Terms() {
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
          Terms of Service
        </h1>
        <p className="text-xs text-muted-foreground mb-8">
          Last updated: June 26, 2026
        </p>

        <div className="space-y-6 text-muted-foreground leading-relaxed text-sm sm:text-base">
          <p>
            Welcome to AERO-SENTINEL. By accessing or using our website and
            services at{" "}
            <a
              href="https://aerosentinel.app"
              className="text-sky-400 hover:text-sky-300 underline"
            >
              aerosentinel.app
            </a>
            , you agree to be bound by these Terms of Service. If you do not
            agree with any part of these terms, please do not use our services.
          </p>

          <h2 className="text-xl font-semibold text-foreground pt-4">
            1. Service Description
          </h2>
          <p>
            AERO-SENTINEL is a free, web-based aviation weather monitoring
            platform that provides real-time TAF (Terminal Aerodrome Forecast),
            METAR (Meteorological Aerodrome Report), and SPECI (Special Weather
            Report) data from ICAO airport weather stations worldwide. Our
            platform enables users to:
          </p>
          <ul className="list-disc list-inside space-y-2 ml-4">
            <li>
              View real-time and historical aviation weather reports for global
              airports.
            </li>
            <li>
              Create personalized airport watchlists for monitoring.
            </li>
            <li>
              Receive browser-based push notifications for significant weather
              changes at watched airports.
            </li>
            <li>
              Analyze TAF forecasts and compare consecutive TAF reports using a
              diff viewer.
            </li>
            <li>
              Access a comprehensive airport database with ICAO/IATA codes and
              timezone information.
            </li>
          </ul>

          <h2 className="text-xl font-semibold text-foreground pt-4">
            2. Important Disclaimer — Weather Data
          </h2>
          <p className="text-amber-400/90 font-medium">
            ⚠️ AERO-SENTINEL is provided for informational and educational
            purposes only. The weather data displayed on this platform is
            sourced from official ICAO meteorological reports and is provided
            "as is" without any guarantee of accuracy, completeness, or
            timeliness.
          </p>
          <p>
            <strong className="text-foreground">
              This platform must NOT be used as the sole source of weather
              information for flight planning, operational decision-making, or
              any safety-critical purpose.
            </strong>{" "}
            Always cross-reference weather data with official sources such as
            your regional aviation weather service, dispatch, or flight
            operations center. Real-time TAF, METAR, and SPECI data may be
            delayed, incomplete, or contain parsing discrepancies. Pilots and
            dispatchers should always consult certified, authoritative aviation
            weather sources before making any go/no-go decisions or flight plan
            amendments.
          </p>

          <h2 className="text-xl font-semibold text-foreground pt-4">
            3. User Responsibilities
          </h2>
          <p>By using AERO-SENTINEL, you agree to:</p>
          <ul className="list-disc list-inside space-y-2 ml-4">
            <li>
              Use the platform in compliance with all applicable laws and
              regulations.
            </li>
            <li>
              Not attempt to disrupt, overload, or compromise the platform's
              infrastructure or security.
            </li>
            <li>
              Not use automated scripts, crawlers, or bots to scrape data from
              the platform without prior written consent.
            </li>
            <li>
              Not misrepresent your identity or affiliation when using the
              platform.
            </li>
            <li>
              Report any bugs, vulnerabilities, or misuse of the platform to
              the development team.
            </li>
          </ul>

          <h2 className="text-xl font-semibold text-foreground pt-4">
            4. Intellectual Property
          </h2>
          <p>
            All content, design, code, graphics, and trademarks associated with
            AERO-SENTINEL are the property of their respective owners. The
            AERO-SENTINEL brand name and logo are proprietary. You may not
            reproduce, distribute, modify, or create derivative works from any
            content on this platform without express written permission.
          </p>
          <p>
            Aviation weather data (TAF, METAR, SPECI reports) displayed on this
            platform originates from ICAO member state meteorological services
            and is subject to their respective terms of use and licensing
            agreements.
          </p>

          <h2 className="text-xl font-semibold text-foreground pt-4">
            5. Limitation of Liability
          </h2>
          <p>
            To the maximum extent permitted by applicable law, AERO-SENTINEL
            and its developers shall not be liable for any direct, indirect,
            incidental, special, consequential, or punitive damages arising out
            of or in connection with your use of the platform. This includes,
            but is not limited to, any loss of data, business interruption,
            or decisions made based on weather data displayed on the platform.
          </p>
          <p>
            The platform is provided on an "as is" and "as available" basis
            without warranties of any kind, either express or implied,
            including but not limited to implied warranties of merchantability,
            fitness for a particular purpose, and non-infringement.
          </p>

          <h2 className="text-xl font-semibold text-foreground pt-4">
            6. Service Availability
          </h2>
          <p>
            We strive to maintain high availability of the platform, but we do
            not guarantee uninterrupted access. The platform may be
            temporarily unavailable due to maintenance, updates, or
            circumstances beyond our control. We reserve the right to modify,
            suspend, or discontinue any part of the service at any time
            without prior notice.
          </p>

          <h2 className="text-xl font-semibold text-foreground pt-4">
            7. Changes to These Terms
          </h2>
          <p>
            We reserve the right to modify these Terms of Service at any time.
            Changes will be effective immediately upon posting on this page.
            Your continued use of the platform after any changes constitutes
            acceptance of the revised terms. We recommend reviewing these terms
            periodically.
          </p>

          <h2 className="text-xl font-semibold text-foreground pt-4">
            8. Governing Law
          </h2>
          <p>
            These Terms of Service shall be governed by and construed in
            accordance with applicable international laws, without regard to
            conflict of law provisions. Any disputes arising from or relating to
            these terms shall be resolved in the appropriate jurisdiction.
          </p>

          <h2 className="text-xl font-semibold text-foreground pt-4">
            9. Contact
          </h2>
          <p>
            For any questions about these Terms of Service, please contact us at{" "}
            <a
              href="mailto:contact@aerosentinel.app"
              className="text-sky-400 hover:text-sky-300 underline"
            >
              contact@aerosentinel.app
            </a>
            .
          </p>
        </div>

        <div className="mt-10 flex flex-wrap gap-4 text-sm">
          <Link
            href="/about"
            className="text-sky-400 hover:text-sky-300 transition-colors underline underline-offset-4"
          >
            About
          </Link>
          <Link
            href="/privacy"
            className="text-sky-400 hover:text-sky-300 transition-colors underline underline-offset-4"
          >
            Privacy Policy
          </Link>
        </div>
      </div>
      </main>
    </div>
  );
}
