import { Link } from "wouter";

export default function About() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-3xl mx-auto px-4 py-12 sm:py-16">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-6">
          About AERO-SENTINEL
        </h1>

        <div className="space-y-6 text-muted-foreground leading-relaxed text-sm sm:text-base">
          <p>
            <strong className="text-foreground">AERO-SENTINEL</strong> is a
            professional-grade aviation weather monitoring platform designed to
            provide real-time, mission-critical meteorological intelligence for
            pilots, flight dispatchers, airline operations centers, and aviation
            enthusiasts worldwide. Our platform aggregates and analyzes TAF
            (Terminal Aerodrome Forecast), METAR (Meteorological Aerodrome
            Report), and SPECI (Special Weather Report) data from ICAO airports
            across the globe, delivering instant alerts when significant weather
            changes occur at monitored locations.
          </p>

          <h2 className="text-xl font-semibold text-foreground pt-4">
            Real-Time Weather Monitoring
          </h2>
          <p>
            At the core of AERO-SENTINEL lies a powerful real-time weather
            monitoring engine that continuously polls aviation weather sources
            for updated TAF, METAR, and SPECI reports. When a weather report is
            issued or amended at any airport in your watchlist, our system
            immediately detects the change, parses the meteorological data, and
            presents it in a clean, human-readable format. Critical weather
            parameters such as wind shear, microburst, severe turbulence, low
            visibility, thunderstorms, and freezing precipitation are highlighted
            with color-coded alerts so that you can quickly assess the
            operational impact on your flights.
          </p>

          <h2 className="text-xl font-semibold text-foreground pt-4">
            Designed for Aviation Professionals
          </h2>
          <p>
            AERO-SENTINEL was built from the ground up with the needs of
            aviation professionals in mind. Pilots preparing for departure can
            quickly check destination and alternate airport weather conditions.
            Flight dispatchers responsible for route planning and fuel
            calculations can monitor en-route and destination weather to make
            informed go/no-go decisions. Airline operations teams can track
            weather developments at hub airports and key waypoints. The platform
            supports ICAO four-letter airport identifiers and includes a
            comprehensive airport database with IATA cross-references, timezone
            information, and geographic coordinates.
          </p>

          <h2 className="text-xl font-semibold text-foreground pt-4">
            Personalized Watchlists and Alerts
          </h2>
          <p>
            Users can build personalized airport watchlists to track only the
            locations that matter to them. When enabled, browser push
            notifications deliver real-time alerts directly to your device —
            whether you are on desktop, tablet, or mobile. The alert system
            intelligently deduplicates reports, tracks acknowledged alerts, and
            syncs state across browser tabs and kiosk windows, making it ideal
            for flight operations rooms where multiple displays may be in use.
            The TAF diff viewer allows you to compare consecutive TAF forecasts
            side by side, making it easy to spot significant changes in
            predicted weather conditions.
          </p>

          <h2 className="text-xl font-semibold text-foreground pt-4">
            Free and Open to All
          </h2>
          <p>
            AERO-SENTINEL is completely free to use and open to all aviation
            enthusiasts. There are no subscription fees, no hidden charges, and
            no account requirements for basic functionality. Our mission is to
            make aviation weather data accessible, readable, and actionable for
            everyone — from student pilots checking weather for their first
            solo flight to experienced captains operating long-haul routes
            across continents. We believe that timely and accurate weather
            information is a fundamental pillar of aviation safety, and we are
            committed to providing it without barriers.
          </p>

          <h2 className="text-xl font-semibold text-foreground pt-4">
            Technical Infrastructure
          </h2>
          <p>
            The platform is built with modern web technologies including React,
            TypeScript, and Tailwind CSS on the frontend. The backend API is
            hosted on Railway and serves aggregated aviation weather data. The
            frontend is deployed on Cloudflare Pages for fast, global content
            delivery with edge caching. Progressive Web App (PWA) support
            enables installation on home screens and kiosk-mode deployment. The
            application leverages service workers for offline resilience and
            background data synchronization.
          </p>

          <h2 className="text-xl font-semibold text-foreground pt-4">
            Global Coverage
          </h2>
          <p>
            AERO-SENTINEL monitors ICAO airport weather stations across all
            continents. Whether you are tracking weather at major international
            hubs like EGLL (London Heathrow), KJFK (New York JFK), or at
            smaller regional airports, our platform provides the same
            real-time monitoring and alerting capabilities. The system processes
            standard ICAO weather formats including TAF, METAR, SPECI, and
            TREND data, ensuring compatibility with global aviation
            meteorological standards.
          </p>

          <h2 className="text-xl font-semibold text-foreground pt-4">
            Contact
          </h2>
          <p>
            For questions, feedback, or partnership inquiries, please reach out
            through our platform. We value user feedback and continuously work
            to improve AERO-SENTINEL based on the needs of the aviation
            community.
          </p>
        </div>

        <div className="mt-10 flex flex-wrap gap-4 text-sm">
          <Link
            href="/privacy"
            className="text-sky-400 hover:text-sky-300 transition-colors underline underline-offset-4"
          >
            Privacy Policy
          </Link>
          <Link
            href="/terms"
            className="text-sky-400 hover:text-sky-300 transition-colors underline underline-offset-4"
          >
            Terms of Service
          </Link>
        </div>
      </div>
    </div>
  );
}
