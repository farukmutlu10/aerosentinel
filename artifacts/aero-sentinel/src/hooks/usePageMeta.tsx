import { Helmet } from "react-helmet-async";

interface PageMetaProps {
  title: string;
  description: string;
  canonical?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  ogType?: string;
  jsonLd?: object;
}

export function PageMeta({ title, description, canonical, ogTitle, ogDescription, ogImage, ogType, jsonLd }: PageMetaProps) {
  const fullTitle = title.includes("AERO-SENTINEL") ? title : `${title} — AERO-SENTINEL`;
  const url = canonical || `https://aerosentinel.app${typeof window !== "undefined" ? window.location.pathname : ""}`;
  const image = ogImage || "https://aerosentinel.app/opengraph.jpg";
  const jsonLdStr = jsonLd ? JSON.stringify(jsonLd) : null;

  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={url} />
      <meta property="og:title" content={ogTitle || fullTitle} />
      <meta property="og:description" content={ogDescription || description} />
      <meta property="og:url" content={url} />
      <meta property="og:image" content={image} />
      <meta property="og:type" content={ogType || "website"} />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={ogTitle || fullTitle} />
      <meta name="twitter:description" content={ogDescription || description} />
      {jsonLdStr && (
        <script type="application/ld+json">{jsonLdStr}</script>
      )}
    </Helmet>
  );
}
