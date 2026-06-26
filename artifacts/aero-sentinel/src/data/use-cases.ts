export interface UseCase {
  slug: string;
  title: string;
  icon: string;
  description: string;
  content: string;
}

export const useCases: UseCase[] = [
  {
    slug: "pilots",
    title: "For Pilots",
    icon: "🧑‍✈️",
    description: "Pre-flight planning, en-route monitoring, and arrival weather assessment for professional and student pilots.",
    content: `<h2>Pre-Flight Weather Intelligence</h2>
<p>Every flight begins with weather analysis. Pilots must evaluate current conditions and forecasts at their departure airport, destination, alternates, and along the planned route. AERO-SENTINEL streamlines this process by aggregating TAF and METAR data for all relevant airports into a single, easy-to-scan dashboard. Within seconds, you can assess whether conditions are VFR, MVFR, IFR, or LIFR at each airport along your route, enabling rapid go/no-go decisions during pre-flight planning.</p>

<p>The decoded METAR and TAF displays eliminate the need to manually interpret coded weather groups, saving valuable time during the planning phase. Each parameter — wind, visibility, clouds, temperature, altimeter — is presented in plain language with color-coded severity indicators. This means you can quickly identify whether winds are within your aircraft's crosswind limitations, whether ceilings are above minimums, and whether significant weather phenomena like thunderstorms or icing are reported at any point in your route.</p>

<h2>En-Route Weather Monitoring</h2>
<p>Conditions change during flight. AERO-SENTINEL's real-time alert system notifies you the moment a TAF amendment, SPECI report, or critical weather change occurs at any airport in your watchlist. This is especially valuable for IFR operations where a sudden ceiling reduction or visibility drop at your destination could require a diversion to an alternate airport. By receiving alerts in real time, you and your co-pilot can begin evaluating alternatives before the situation becomes critical.</p>

<p>For pilots operating in congested airspace or during instrument approaches, having immediate access to the latest METAR data can mean the difference between a smooth approach and an unexpected go-around. AERO-SENTINEL ensures that the weather picture you're working with is always current, giving you the information needed to make confident decisions at every phase of flight.</p>`
  },
  {
    slug: "dispatchers",
    title: "For Dispatchers",
    icon: "📊",
    description: "Real-time weather tracking and route optimization for flight dispatchers and operations centers.",
    content: `<h2>Centralized Weather Intelligence</h2>
<p>Flight dispatchers bear responsibility for the safety and efficiency of every flight they release. Weather is the single most dynamic factor in flight planning, and dispatchers need real-time visibility into conditions at departure, destination, alternate, and en-route airports. AERO-SENTINEL provides this visibility through a centralized dashboard that aggregates TAF and METAR data for multiple airports simultaneously, enabling dispatchers to maintain a comprehensive weather picture across their entire route network.</p>

<p>The watchlist feature allows dispatchers to configure monitoring for airports relevant to their current flight assignments. When conditions change at a watched airport — whether it's a TAF amendment predicting new thunderstorm activity, a METAR reporting rapidly dropping visibility, or a SPECI indicating wind shear — the dispatcher receives an immediate alert. This proactive monitoring approach ensures that weather-related operational changes are identified and addressed before they cascade into delays or diversions.</p>

<h2>Route Optimization Support</h2>
<p>With AERO-SENTINEL's Flight Analysis view, dispatchers can compare weather conditions across multiple airports side by side. This comparison is essential for alternate airport selection, where regulations require identification of suitable alternates with acceptable weather forecasts. By displaying decoded TAF data for departure, destination, and potential alternates in a single view, AERO-SENTINEL reduces the time required for alternate assessment and helps dispatchers select the most operationally appropriate options.</p>

<p>Historical TAF change tracking provides additional value for dispatchers managing recurring routes. By reviewing how forecasts have evolved over previous days and weeks, dispatchers can identify weather patterns that may affect upcoming flights, such as seasonal fog tendencies at specific airports or prevailing wind patterns that influence runway configuration and arrival rates.</p>`
  },
  {
    slug: "students",
    title: "For Aviation Students",
    icon: "🎓",
    description: "Learning tool for TAF/METAR interpretation, weather theory, and aviation meteorology education.",
    content: `<h2>Learning Aviation Weather</h2>
<p>Aviation meteorology is one of the most challenging subjects in pilot training. Understanding how to read and interpret METAR reports, TAF forecasts, and significant weather charts requires exposure to real-world data and practice decoding coded groups. AERO-SENTINEL serves as an invaluable learning companion by providing live, real-world weather data with instant decoding and explanations for every coded group.</p>

<p>When a student encounters a METAR report they don't understand, they can view the decoded version side by side with the raw text. Each group — from wind direction and speed codes to weather phenomenon abbreviations and cloud layer designations — is explained in plain language. This immediate feedback loop accelerates the learning process far more effectively than studying static textbook examples, because students are working with actual observations from real airports in real-time conditions.</p>

<h2>Building Pattern Recognition</h2>
<p>One of the most important skills in aviation weather interpretation is pattern recognition — the ability to quickly identify significant changes and trends without having to carefully decode every parameter. AERO-SENTINEL supports this skill development by highlighting changes between successive METAR reports and TAF amendments. Students can observe how weather evolves at an airport over hours and days, developing an intuitive understanding of how fronts, pressure systems, and convective activity manifest in surface observations and forecasts.</p>

<p>The flight category classification system (VFR, MVFR, IFR, LIFR) provides a useful framework for understanding how multiple weather parameters combine to affect operational suitability. By watching how category changes correspond to specific METAR and TAF updates, students build the analytical skills needed for real-world flight planning and decision-making.</p>`
  },
  {
    slug: "aircraft-operators",
    title: "For Aircraft Operators",
    icon: "🏢",
    description: "Fleet management support with weather-based operational decisions and multi-airport monitoring.",
    content: `<h2>Fleet-Wide Weather Monitoring</h2>
<p>Aircraft operators managing multiple aircraft across a network of airports need comprehensive weather visibility to make informed scheduling, routing, and maintenance decisions. AERO-SENTINEL's multi-airport monitoring capability provides exactly this, allowing operators to track weather conditions at every airport in their operational footprint from a single interface.</p>

<p>When an operator's fleet includes aircraft at airports experiencing weather deterioration, the consequences can extend beyond individual flights. A thunderstorm at a hub airport can ground multiple aircraft simultaneously, cascade delays across the network, and require repositioning flights to maintain schedule integrity. AERO-SENTINEL's alert system ensures that operators are aware of developing conditions before they impact operations, providing the lead time needed to implement contingency plans.</p>

<h2>Weather-Based Decision Making</h2>
<p>Operational decisions at the fleet level often depend on weather conditions at multiple locations. Dispatching a ferry flight to reposition an aircraft requires knowing the weather at both the origin and destination. Scheduling maintenance that involves taxiing or ground runs may need to account for wind or precipitation limits. Planning charter operations to unfamiliar airports requires thorough weather assessment at unfamiliar locations. AERO-SENTINEL supports all of these decisions by providing decoded, current weather data for any airport worldwide.</p>

<p>The platform's ability to display TAF forecasts alongside current METAR observations is particularly valuable for operators making advance planning decisions. When a TAF predicts conditions improving within a few hours, an operator might choose to delay a departure rather than cancel. When a TAF predicts deterioration, the operator can proactively rebook passengers or redirect aircraft before conditions deteriorate. This forward-looking capability transforms weather data from a reactive tool into a strategic planning asset.</p>`
  },
  {
    slug: "weather-enthusiasts",
    title: "For Weather Enthusiasts",
    icon: "🌦️",
    description: "Global weather tracking, data analysis, and aviation meteorology exploration for weather enthusiasts.",
    content: `<h2>Exploring Global Aviation Weather</h2>
<p>Weather enthusiasts who are passionate about meteorology find aviation weather data particularly fascinating because it represents some of the most precise, frequent, and standardized weather observations available. METAR reports are issued hourly (or more frequently during changing conditions) using internationally standardized formats, making them an excellent resource for studying local and regional weather patterns. AERO-SENTINEL makes this data accessible and interpretable for enthusiasts who may not have formal aviation training.</p>

<p>By adding airports from different climate zones and geographic regions to your watchlist, you can observe how weather varies across the globe in real time. Compare the morning fog formation at San Francisco (KSFO) with the afternoon convective buildup over central Florida (KMCO). Track the passage of winter storms across northern European airports or monitor monsoon conditions at Southeast Asian stations. AERO-SENTINEL turns the global network of aviation weather stations into a living laboratory for weather observation and analysis.</p>

<h2>Understanding Weather Patterns</h2>
<p>The decoded METAR and TAF displays in AERO-SENTINEL help weather enthusiasts understand the relationship between raw observations and actual conditions. By studying how parameters like pressure tendency, wind shift, and visibility change over time, enthusiasts can develop a deeper understanding of atmospheric dynamics. The flight category system provides a useful summary metric that aggregates multiple parameters into an overall conditions assessment.</p>

<p>For enthusiasts interested in severe weather, AERO-SENTINEL's alert system provides real-time notification of significant weather events as they're reported by aviation weather stations. Thunderstorm activity, wind shear events, microburst reports, and severe turbulence observations all generate alerts that can be tracked as weather systems develop and move. This real-time reporting channel offers a ground-level perspective on severe weather that complements radar imagery and satellite data.</p>`
  },
];

export function getUseCaseBySlug(slug: string): UseCase | undefined {
  return useCases.find((uc) => uc.slug === slug);
}
