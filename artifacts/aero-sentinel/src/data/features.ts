export interface Feature {
  slug: string;
  title: string;
  icon: string;
  description: string;
  content: string;
}

export const features: Feature[] = [
  {
    slug: "taf-monitoring",
    title: "TAF Monitoring",
    icon: "📡",
    description: "Continuous Terminal Aerodrome Forecast tracking with instant change detection and visual diff comparison.",
    content: `<h2>What is TAF Monitoring?</h2>
<p>A <strong>Terminal Aerodrome Forecast (TAF)</strong> is a meteorological report that provides a predicted weather outlook for a specific airport, typically covering a 24 to 30-hour window. TAFs are issued by certified meteorologists at airport weather stations and are essential for pilots, dispatchers, and flight operations teams who need to plan departures, arrivals, and en-route segments with confidence.</p>

<p>AERO-SENTINEL's TAF Monitoring feature continuously polls aviation weather sources for updated TAF reports at every airport in your watchlist. When a new TAF is issued or an existing TAF is amended (TAF AMD) or corrected (TAF COR), our system detects the change within seconds and immediately notifies you. This means you never miss a critical weather update at your monitored airports, whether you're on the ground preparing for departure or monitoring conditions from an operations center.</p>

<h2>How Does It Work?</h2>
<p>Our monitoring engine runs a persistent polling loop against official METAR/TAF data feeds. Each time a new TAF report arrives, it is parsed into structured data including wind direction and speed, visibility, cloud layers, temperature, dewpoint, and significant weather phenomena. The system then compares the new TAF against the previous version and generates a detailed diff that highlights exactly which parameters changed.</p>

<p>For example, if a TAF amendment updates the wind forecast from 180° at 12 knots to 240° at 25 knots with gusts to 35 knots, AERO-SENTINEL will flag this as a significant change, display the before-and-after values, and classify the alert severity based on operational impact. You can review these changes in the Alert Dashboard or receive push notifications if you have browser notifications enabled.</p>

<h2>Key Advantages</h2>
<p>The primary advantage of continuous TAF monitoring is <strong>proactive decision-making</strong>. Instead of manually checking weather updates every 30 minutes, AERO-SENTINEL works in the background and surfaces changes the moment they happen. This is particularly valuable during rapidly evolving weather situations such as approaching thunderstorm complexes, frontal passages, or fog formation events where conditions can deteriorate faster than the standard TAF update cycle.</p>

<p>Our system also maintains a complete history of TAF changes for each airport, allowing you to review how forecasts have evolved over time. This historical perspective is invaluable for understanding weather trends and improving forecast interpretation skills. Whether you're a professional dispatcher managing dozens of flights or a general aviation pilot planning a cross-country trip, AERO-SENTINEL's TAF Monitoring keeps you informed and ahead of changing conditions.</p>`
  },
  {
    slug: "metar-parser",
    title: "METAR Parser",
    icon: "🔍",
    description: "Real-time METAR decoding with human-readable translations and coded group explanations.",
    content: `<h2>Understanding METAR Reports</h2>
<p>A <strong>Meteorological Aerodrome Report (METAR)</strong> is the most fundamental weather observation in aviation. Issued at least once per hour (and more frequently when conditions change significantly), METAR reports contain critical real-time weather data including surface wind, visibility, cloud coverage, temperature, altimeter setting, and any significant weather phenomena occurring at the station. Learning to read raw METAR text is a core skill for every pilot, but the coded format can be intimidating for students and even experienced aviators encountering unfamiliar codes.</p>

<h2>Instant METAR Decoding</h2>
<p>AERO-SENTINEL's METAR Parser takes raw METAR text and instantly converts it into a clear, human-readable format. Each coded group in the METAR is decoded and explained, so you can understand exactly what the observation is reporting without needing to memorize dozens of abbreviation rules. For instance, a raw METAR reading <code>BKN025CB</code> is translated to "Broken clouds at 2,500 feet with cumulonimbus," making the observation accessible to users at all experience levels.</p>

<p>The parser handles all standard METAR groups including <strong>wind</strong> (direction, speed, gusts, variable), <strong>visibility</strong> (statute miles and RVR values), <strong>weather phenomena</strong> (rain, snow, fog, thunderstorms, mist, haze), <strong>cloud layers</strong> (scattered, broken, overcast, ceiling), <strong>temperature and dewpoint</strong>, and <strong>altimeter setting</strong> (inHg and hPa). Each group is color-coded and labeled for quick visual scanning.</p>

<h2>Coded Group Explanations</h2>
<p>Beyond simple translation, AERO-SENTINEL provides detailed explanations for every coded group. When you see <code>TSRA</code>, the system explains that this represents a thunderstorm with rain. When a METAR includes <code>WS015/28045KT</code>, you'll see that this indicates wind shear at 1,500 feet with winds from 280° at 45 knots. This educational approach helps users build their METAR reading skills over time while still providing immediate comprehension of current conditions.</p>

<p>The parser also identifies <strong>flight categories</strong> (VFR, MVFR, IFR, LIFR) based on ceiling and visibility thresholds, giving you an instant assessment of whether conditions are suitable for VFR or IFR flight operations. This classification is displayed prominently alongside the decoded METAR, enabling rapid decision-making during pre-flight planning or en-route weather assessment.</p>

<h2>Why It Matters</h2>
<p>Accurate METAR interpretation is not just an academic exercise — it directly impacts flight safety. Misreading a visibility value or overlooking a wind shear code can have serious consequences. AERO-SENTINEL's METAR Parser eliminates guesswork by presenting every piece of information in a structured, unambiguous format that reduces the risk of misinterpretation and supports confident, informed decision-making.</p>`
  },
  {
    slug: "weather-alerts",
    title: "Weather Alerts",
    icon: "⚡",
    description: "Intelligent alert system with configurable thresholds and critical condition detection.",
    content: `<h2>Intelligent Alert Detection</h2>
<p>AERO-SENTINEL's Weather Alert system is designed to keep you ahead of dangerous conditions by monitoring your watched airports 24/7 and instantly notifying you when significant weather changes occur. Unlike basic weather apps that simply display current conditions, our alert engine actively compares incoming reports against previous observations and forecasts to identify changes that matter for flight operations.</p>

<p>When a new METAR, TAF, or SPECI report is detected at one of your watched airports, the system evaluates multiple parameters simultaneously. It checks for <strong>wind speed increases</strong>, <strong>visibility drops</strong>, <strong>ceiling reductions</strong>, <strong>new weather phenomena</strong> (thunderstorms, wind shear, freezing precipitation), and <strong>category changes</strong> (VFR to MVFR, MVFR to IFR, or IFR to LIFR). Each change is scored for operational significance, and alerts are generated only when the change crosses meaningful thresholds.</p>

<h2>Alert Types</h2>
<p>AERO-SENTINEL supports several distinct alert types, each corresponding to a specific kind of weather report or change:</p>
<ul>
<li><strong>TAF Amendment (AMD)</strong> — Triggered when a TAF is amended, indicating that the original forecast was significantly different from evolving conditions.</li>
<li><strong>TAF Correction (COR)</strong> — Issued when a TAF contains an error that has been corrected by the issuing station.</li>
<li><strong>SPECI Report</strong> — A special weather observation triggered by rapid or significant changes between routine METAR cycles.</li>
<li><strong>Category Change</strong> — Alerts when the flight category at an airport transitions between VFR, MVFR, IFR, and LIFR.</li>
<li><strong>Critical Weather</strong> — Flags conditions such as wind shear, microburst, severe turbulence, thunderstorms, and freezing rain that pose immediate operational hazards.</li>
</ul>

<h2>Notification Delivery</h2>
<p>Alerts are delivered through multiple channels to ensure you never miss a critical update. On desktop and mobile browsers that support push notifications, AERO-SENTINEL can send instant pop-up alerts even when the tab is in the background. The alert toast appears on-screen with the airport identifier, alert type, and a summary of what changed. You can acknowledge alerts to mark them as reviewed, or tap "View Changes" to see the full before-and-after comparison.</p>

<p>All alerts are also logged in the dedicated Alerts Dashboard, where you can browse, filter, and review historical alerts. The dashboard supports filtering by airport, alert type, and acknowledgment status, making it easy to manage high volumes of alerts during busy weather events.</p>

<h2>Configurable Monitoring</h2>
<p>You have full control over which airports are monitored through the Personalized Watchlist feature. Add airports by ICAO code, and AERO-SENTINEL will begin tracking weather reports at those locations immediately. This targeted approach means you receive alerts only for airports that are relevant to your operations, reducing noise and ensuring that every notification carries actionable information.</p>`
  },
  {
    slug: "flight-analysis",
    title: "Flight Analysis",
    icon: "✈️",
    description: "Comprehensive weather analysis tools for flight planning and operational decision-making.",
    content: `<h2>Weather-Driven Flight Analysis</h2>
<p>Flight planning in aviation is fundamentally driven by weather. Every departure, arrival, and en-route segment must account for wind patterns, visibility, cloud layers, precipitation, and a host of other meteorological factors. AERO-SENTINEL's Flight Analysis tools provide a comprehensive view of weather conditions across multiple airports, enabling pilots and dispatchers to make informed routing and timing decisions.</p>

<p>The ANALYZE tab in AERO-SENTINEL presents a structured overview of TAF and METAR data for airports in your watchlist. Each airport is displayed with its current flight category, latest METAR observation, and the active TAF forecast. This consolidated view allows you to quickly compare conditions across multiple airports along your planned route, identifying favorable weather windows and avoiding areas with deteriorating conditions.</p>

<h2>Route Weather Comparison</h2>
<p>When planning a flight between two or more airports, understanding the weather at each endpoint and along the route is essential. AERO-SENTINEL makes this easy by displaying weather data for all your watched airports in a single, sortable list. You can sort airports alphabetically, by flight category (LIFR first or VFR first), and switch between TAF-only, METAR-only, or combined views. This flexibility lets you quickly assess whether conditions are improving or deteriorating at your departure, destination, and alternate airports.</p>

<p>For each airport, the analysis view shows decoded weather parameters including wind direction and speed, visibility, cloud bases, weather phenomena, temperature, and altimeter setting. Significant weather items such as thunderstorms, wind shear, and low visibility are highlighted with color-coded indicators, drawing your attention to the parameters that have the greatest operational impact.</p>

<h2>Historical Trend Analysis</h2>
<p>Understanding how weather is trending is just as important as knowing current conditions. AERO-SENTINEL maintains a history of TAF changes and METAR observations for each airport, allowing you to see how forecasts have evolved over the past several hours. If a TAF has been amended multiple times with progressively lower ceilings, this trend indicates an approaching weather system that may continue to deteriorate beyond the current forecast period.</p>

<p>This historical context is particularly valuable for go/no-go decisions, alternate airport selection, and fuel planning. By reviewing the trajectory of weather changes at your key airports, you can make more conservative or aggressive planning decisions based on whether conditions are stable, improving, or declining. AERO-SENTINEL transforms raw meteorological data into actionable intelligence that directly supports safer, more efficient flight operations.</p>`
  },
  {
    slug: "watchlist",
    title: "Personalized Watchlists",
    icon: "📋",
    description: "Custom airport watchlists for targeted weather monitoring and filtered alert delivery.",
    content: `<h2>What is a Watchlist?</h2>
<p>AERO-SENTINEL's Personalized Watchlist feature allows you to create a custom list of airports that you want to monitor for weather changes. Instead of receiving alerts for every airport in the system — which could number in the thousands — you specify exactly which locations are relevant to your operations. This targeted approach ensures that every alert you receive is meaningful and actionable, cutting through the noise to deliver the information that matters most.</p>

<p>Building your watchlist is straightforward. You can add airports using their four-letter ICAO code (such as KJFK for John F. Kennedy International, EGLL for London Heathrow, or LTBA for Istanbul Atatürk). The system also supports IATA codes for common airports, automatically converting them to their ICAO equivalents. Once added, each airport begins receiving real-time TAF and METAR monitoring, and you'll be notified whenever significant weather changes occur.</p>

<h2>Watchlist Management</h2>
<p>Your watchlist is stored locally in your browser, meaning it persists across sessions without requiring an account or login. You can add or remove airports at any time, and changes take effect immediately. The watchlist supports an unlimited number of airports, though for optimal performance and alert relevance, we recommend focusing on airports that are directly relevant to your current operations or training.</p>

<p>The Dashboard displays all your watched airports in a clean, organized layout. Each airport card shows the latest METAR observation decoded in human-readable format, the active TAF forecast, the current flight category, and any active alerts. You can sort your watchlist alphabetically, by flight category (showing the worst conditions first or the best conditions first), and filter by route type (domestic or international airports).</p>

<h2>Filtering and Views</h2>
<p>AERO-SENTINEL provides multiple filtering options to help you focus on what matters. You can filter your watchlist by flight category — showing only airports that are IFR, LIFR, MVFR, or VFR. You can also enable a special "CRIT" filter that highlights airports with critical weather conditions such as thunderstorms, wind shear, or severe turbulence. These filters are combinable, allowing you to create custom views that match your specific monitoring needs.</p>

<p>The view mode selector lets you switch between TAF-only, METAR-only, or combined TAF+METAR views. In TAF mode, you see the forecast period and decoded wind/visibility/cloud predictions. In METAR mode, you see the latest actual observation. In BOTH mode, both reports are displayed side by side, giving you a complete picture of current conditions and the expected forecast evolution.</p>

<h2>Why Watchlists Matter</h2>
<p>Effective weather monitoring requires focus. By concentrating your attention on a curated list of airports, you can respond faster to developing situations, maintain better situational awareness, and avoid the cognitive overload that comes with monitoring too many locations simultaneously. AERO-SENTINEL's watchlist feature is designed to support this focused approach, helping you stay sharp and informed when it matters most.</p>`
  },
  {
    slug: "global-airports",
    title: "Global Airport Coverage",
    icon: "🌍",
    description: "Worldwide airport database with ICAO codes and comprehensive aviation weather data integration.",
    content: `<h2>Worldwide Aviation Weather Data</h2>
<p>AERO-SENTINEL provides aviation weather monitoring capabilities for airports across the globe, leveraging the International Civil Aviation Organization (ICAO) standard coding system to identify and track weather stations worldwide. Whether you're monitoring conditions at a major international hub like Tokyo Haneda (RJTT), a busy European airport like Frankfurt (EDDF), or a regional airport in South America, AERO-SENTINEL can track and deliver real-time weather data for your location of interest.</p>

<p>The ICAO airport code system is the universal standard for identifying airports in aviation. Unlike IATA codes, which are primarily used for commercial airline ticketing and baggage handling, ICAO codes are used exclusively for operational purposes including flight planning, weather reporting, air traffic control, andNOTAM distribution. Each four-letter ICAO code uniquely identifies an airport or weather station in the global aviation infrastructure, ensuring unambiguous communication regardless of language or national boundaries.</p>

<h2>How Coverage Works</h2>
<p>AERO-SENTINEL aggregates weather data from official aviation weather sources that serve ICAO-standard METAR and TAF reports. These reports are generated by certified weather observers at airport meteorological stations and are distributed through national and international aviation weather networks. The system polls these sources at regular intervals to ensure that the data displayed is current and accurate.</p>

<p>For airports that issue routine METAR reports, AERO-SENTINEL updates observations at least once per hour, and more frequently when special weather conditions trigger additional SPECI reports. TAF forecasts are typically updated every 6 to 24 hours depending on the station's reporting schedule, and amendments or corrections are detected and flagged immediately upon issuance.</p>

<h2>Adding Any Global Airport</h2>
<p>To monitor an airport in AERO-SENTINEL, you simply need to know its ICAO code. Our built-in search and lookup tools help you find the correct code for any airport you're interested in. Once added to your watchlist, the airport begins receiving real-time monitoring, and you'll be notified of any weather changes, TAF amendments, or critical conditions as they occur.</p>

<p>The platform is particularly useful for international operations where weather conditions at distant airports may be difficult to monitor through local resources. By centralizing global aviation weather data in a single interface, AERO-SENTINEL eliminates the need to navigate multiple national weather service websites or interpret different reporting formats. All data is presented in the same clean, decoded format regardless of the airport's location, providing a consistent monitoring experience whether you're tracking airports in North America, Europe, Asia, Africa, South America, or Oceania.</p>

<h2>Data Quality and Reliability</h2>
<p>All weather data served through AERO-SENTINEL originates from official ICAO-standard sources. We do not fabricate, modify, or interpolate weather data. The raw METAR and TAF text is preserved alongside the decoded presentation, allowing users to verify the parsing accuracy against the original report. This commitment to data integrity ensures that the information you rely on for flight planning and decision-making is accurate, timely, and sourced from the same official channels used by air traffic control and airline operations centers worldwide.</p>`
  },
];

export function getFeatureBySlug(slug: string): Feature | undefined {
  return features.find((f) => f.slug === slug);
}
