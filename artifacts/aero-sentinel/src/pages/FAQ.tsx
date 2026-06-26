import { useState } from "react";
import { Link } from "wouter";
import { Footer } from "@/components/Footer";

interface FAQItem {
  question: string;
  answer: string;
}

const faqData: FAQItem[] = [
  {
    question: "What is AeroSentinel?",
    answer: "AeroSentinel is a professional-grade aviation weather monitoring platform that provides real-time TAF (Terminal Aerodrome Forecast), METAR (Meteorological Aerodrome Report), and SPECI (Special Weather Report) data for airports worldwide. The platform continuously monitors weather conditions at your watched airports and sends instant alerts when significant changes occur. It is designed for pilots, flight dispatchers, aviation students, aircraft operators, and weather enthusiasts who need reliable, timely meteorological intelligence for flight operations and weather analysis."
  },
  {
    question: "How does real-time TAF/METAR monitoring work?",
    answer: "AeroSentinel's monitoring engine continuously polls official aviation weather data sources at regular intervals. When a new METAR observation or TAF forecast is issued at any airport in your watchlist, the system detects the update, parses the raw weather text into structured data, and compares it against the previous report. If significant changes are identified — such as visibility drops, ceiling reductions, wind speed increases, or new weather phenomena — an alert is generated and delivered to you via browser push notifications and the on-screen alert dashboard. The entire process from report issuance to alert delivery typically takes just a few seconds."
  },
  {
    question: "Is AeroSentinel free to use?",
    answer: "Yes, AeroSentinel is free to use for all users. You can add airports to your personalized watchlist, receive real-time weather alerts, view decoded METAR and TAF reports, and access the full feature set without any subscription or payment. The platform is supported by advertisements, which help cover the operational costs of continuous weather data monitoring and server infrastructure. We are committed to keeping the core monitoring experience accessible to all aviation professionals and enthusiasts."
  },
  {
    question: "Which airports are supported?",
    answer: "AeroSentinel supports airports worldwide that issue ICAO-standard METAR and TAF reports. This includes virtually all major international airports, regional airports, and many general aviation fields across North America, Europe, Asia, South America, Africa, and Oceania. To add an airport to your watchlist, you simply need to know its four-letter ICAO code (such as KJFK for New York JFK, EGLL for London Heathrow, or RJTT for Tokyo Haneda). The system automatically retrieves and monitors weather data for any valid ICAO station that issues routine observations."
  },
  {
    question: "How do weather alerts work?",
    answer: "When AeroSentinel detects a significant weather change at one of your watched airports, it generates an alert and delivers it through multiple channels. Browser push notifications appear as pop-up alerts on your desktop or mobile device, even when the AeroSentinel tab is in the background. The on-screen alert toast displays the airport identifier, alert type, and a brief summary of the change. All alerts are also logged in the dedicated Alerts Dashboard where you can browse, filter by airport or alert type, and review historical alerts. You can acknowledge individual alerts to mark them as reviewed."
  },
  {
    question: "What is a SPECI report and when is it triggered?",
    answer: "A SPECI (Special Weather Observation) is an unscheduled METAR-type report issued when significant weather changes occur between routine hourly observation cycles. SPECI reports are triggered by specific conditions defined by ICAO standards, including: visibility dropping below or rising above 1 statute mile, wind direction shifting by 40 degrees or more, wind speed increasing or decreasing by 15 knots or more, thunderstorm activity starting or stopping, hail reported, fog or mist forming or dissipating, or ceiling changing between specific thresholds. AeroSentinel detects and alerts you to SPECI reports in real time, ensuring you're aware of rapidly changing conditions."
  },
  {
    question: "How accurate is the weather data?",
    answer: "All weather data displayed in AeroSentinel originates from official ICAO-standard aviation weather sources. METAR reports are issued by certified weather observers at airport meteorological stations, and TAF forecasts are prepared by licensed meteorologists using sophisticated numerical weather prediction models and local expertise. AeroSentinel does not fabricate, modify, or interpolate weather data — the raw text is preserved alongside the decoded presentation for verification. However, like all weather data, observations represent conditions at a specific moment in time and forecasts are inherently probabilistic, so they should be used in conjunction with pilot judgment and other information sources."
  },
  {
    question: "Can I set up personalized watchlists?",
    answer: "Yes, AeroSentinel's personalized watchlist feature allows you to create a custom list of airports to monitor. You can add airports by their ICAO code or common IATA code, and the system will begin tracking weather data for those locations immediately. Your watchlist is stored locally in your browser, so it persists across sessions without requiring an account login. You can add or remove airports at any time, and changes take effect instantly. The Dashboard displays all watched airports with their current weather conditions, flight categories, and any active alerts in a sortable, filterable view."
  },
  {
    question: "How do notifications work on mobile and desktop?",
    answer: "AeroSentinel uses the Web Push Notification API to deliver real-time alerts to your device. On desktop browsers (Chrome, Firefox, Edge, Safari), you'll see a prompt asking for notification permission when you first enable alerts. On mobile devices, notifications work through the browser when the site is open, or through the PWA (Progressive Web App) when installed to your home screen. Notifications include the airport identifier, alert type, and a brief description of the weather change. If you dismiss the notification prompt or have notifications blocked, you can still view all alerts in the on-screen alert dashboard and toast notifications."
  },
  {
    question: "What is the difference between TAF and METAR?",
    answer: "A METAR (Meteorological Aerodrome Report) is a real-time observation of current weather conditions at an airport, issued at least once per hour by certified weather observers. It reports what the weather IS doing right now. A TAF (Terminal Aerodrome Forecast) is a prediction of expected weather conditions over a future period, typically 24 to 30 hours, issued by meteorologists using weather models and analysis. It reports what the weather IS EXPECTED to do. METARs are used for immediate operational decisions (can I take off now?), while TAFs are used for planning (will conditions at my destination be acceptable when I arrive?). AeroSentinel displays both, giving you a complete picture of current and forecast conditions."
  },
  {
    question: "How often is the weather data updated?",
    answer: "METAR observations are typically updated once per hour at most stations, with additional SPECI reports issued when significant changes occur between hourly cycles. TAF forecasts are updated every 6 to 24 hours depending on the station's reporting schedule, with amendments (TAF AMD) and corrections (TAF COR) issued as needed. AeroSentinel polls the data sources every few minutes, meaning you'll see new observations and forecasts within minutes of their official issuance. For rapidly changing conditions, SPECI reports ensure you're notified of significant changes as soon as they're reported by the observing station."
  },
  {
    question: "Can I use AeroSentinel for flight planning?",
    answer: "AeroSentinel provides valuable weather intelligence that supports flight planning, but it should be used as one of several resources rather than a sole planning tool. The decoded METAR and TAF displays help you assess current and forecast conditions at departure, destination, and alternate airports. The Flight Analysis view lets you compare conditions across multiple airports simultaneously. However, for formal flight planning, you should always consult official sources including your flight service provider, approved weather briefing services, and applicable regulatory requirements. AeroSentinel is best used as a supplementary monitoring and situational awareness tool."
  },
  {
    question: "What browsers and devices are supported?",
    answer: "AeroSentinel is a web application that works on any modern browser with JavaScript enabled, including Google Chrome, Mozilla Firefox, Apple Safari, and Microsoft Edge on both desktop and mobile platforms. The interface is fully responsive and adapts to screen sizes from small smartphones to large desktop monitors. For the best experience with push notifications, we recommend using Chrome or Firefox on desktop, or installing the AeroSentinel PWA (Progressive Web App) on your mobile device. The PWA can be added to your home screen from the browser menu, providing an app-like experience with background notification support."
  },
  {
    question: "How does AeroSentinel handle data privacy?",
    answer: "AeroSentinel takes data privacy seriously. Your personalized watchlist is stored locally in your browser using localStorage and is never transmitted to our servers. We do not require user accounts or login credentials for the core monitoring experience. Analytics data is collected anonymously through Google Analytics to help us understand usage patterns and improve the platform. Browser push notification permissions are managed entirely by your browser and operating system, and you can revoke them at any time. We do not sell, share, or provide personal data to third parties. For full details, please review our Privacy Policy page."
  },
  {
    question: "What is wind shear and why is it dangerous?",
    answer: "Wind shear is a sudden, significant change in wind speed and/or direction over a short distance, either horizontally or vertically. In aviation, wind shear is particularly dangerous during takeoff and landing phases when aircraft are at low altitudes and transitioning between different airspeeds. A sudden tailwind-to-headwind or headwind-to-tailwind change can cause rapid airspeed fluctuations that are difficult to compensate for, potentially leading to loss of lift. Wind shear is often associated with thunderstorm downdrafts, microbursts, frontal boundaries, and temperature inversions. AeroSentinel detects and alerts you to wind shear reports (WS codes in METARs) at your watched airports, providing critical awareness of this hazardous condition."
  },
  {
    question: "Can I acknowledge alerts?",
    answer: "Yes, AeroSentinel allows you to acknowledge individual alerts to mark them as reviewed. When an alert toast notification appears on your screen, you can tap the acknowledge button to suppress that alert from the unacknowledged count. Acknowledged alerts are tracked locally in your browser and persist across sessions. The Alerts Dashboard shows both acknowledged and unacknowledged alerts, with filtering options to focus on unread alerts. The unacknowledged alert count is displayed on the ALERTS tab in the navigation bar and on the mobile bottom tab bar, giving you a quick indicator of pending alerts that require your attention."
  },
  {
    question: "Is there an API available?",
    answer: "AeroSentinel currently provides a web-based interface for weather monitoring and does not offer a public REST API for third-party integrations. The internal API used by the platform's frontend communicates with the backend server to retrieve watchlist weather data and alert information. If you're interested in programmatic access to aviation weather data, we recommend exploring official sources such as the Aviation Weather Center (aviationweather.gov), the ICAO Meteorological Information Data Bank, or national meteorological service APIs in your region. We may consider offering a public API in the future based on user demand."
  },
  {
    question: "How does the ICAO airport code system work?",
    answer: "The ICAO (International Civil Aviation Organization) airport code system uses four-letter alphanumeric codes to uniquely identify airports and weather stations worldwide. Unlike IATA codes (which are three letters used primarily for airline ticketing), ICAO codes are used for all operational aviation purposes including flight planning, weather reporting, air traffic control, and NOTAM distribution. The first letter typically indicates the region: K for the contiguous United States, E for Northern Europe, L for Southern Europe, R for Japan, and so on. The remaining three letters identify the specific station within that region. AeroSentinel uses ICAO codes as the primary identifier for airport weather monitoring."
  },
  {
    question: "What are the system requirements?",
    answer: "AeroSentinel is a modern web application with minimal system requirements. You need a device with a web browser (Chrome 90+, Firefox 88+, Safari 14+, or Edge 90+), a stable internet connection, and JavaScript enabled. The application is designed to be lightweight and performs well even on older devices or slower connections. For push notifications, your browser and operating system must support the Web Push API. The application uses responsive design and works on screen sizes from 320px width upward. No software installation is required for basic use, though the PWA can be installed for an enhanced mobile experience with offline capabilities."
  },
  {
    question: "How can I contact support?",
    answer: "If you have questions, feedback, or need assistance with AeroSentinel, you can reach our support team by email at contact@aerosentinel.app. We also have a dedicated Contact page accessible from the footer navigation on any page of the site. For general inquiries, feature requests, or bug reports, please include as much detail as possible so we can respond efficiently. We aim to respond to all inquiries within 48 hours during business days. For urgent operational issues, please check our status page and community resources first, as many common questions are addressed in our FAQ and documentation."
  }
];

export default function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const toggle = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

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
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">
            Frequently Asked Questions
          </h1>
          <p className="text-muted-foreground text-base sm:text-lg mb-10 max-w-2xl">
            Find answers to common questions about AeroSentinel's aviation weather monitoring features, alerts, and platform capabilities.
          </p>

          <div className="space-y-3">
            {faqData.map((item, index) => (
              <div
                key={index}
                className="border border-border rounded-xl overflow-hidden bg-card"
              >
                <button
                  onClick={() => toggle(index)}
                  className="w-full text-left px-5 py-4 flex items-center justify-between gap-4 hover:bg-muted/30 transition-colors"
                >
                  <span className="font-semibold text-sm sm:text-base text-foreground">
                    {item.question}
                  </span>
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={`flex-shrink-0 text-muted-foreground transition-transform duration-200 ${
                      openIndex === index ? "rotate-180" : ""
                    }`}
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>
                {openIndex === index && (
                  <div className="px-5 pb-5 text-sm text-muted-foreground leading-relaxed border-t border-border/50 pt-4">
                    {item.answer}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
