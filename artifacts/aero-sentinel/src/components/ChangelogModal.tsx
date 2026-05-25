import { useEffect } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
}

const V18_SECTIONS = [
  {
    title: "Uçuş Kategori Kuralları",
    items: [
      "LIFR eşiği 1500m'den 1600m'e güncellendi; IFR 1600–4799m, MVFR 4800–7999m, VFR ≥8000m.",
      "Tavan değerleri: LIFR <500ft, IFR 500–999ft, MVFR 1000–2999ft, VFR ≥3000ft.",
      "Kural mantığı: LIFR için VIS veya CEIL kriterinden biri yeterli (OR); VFR için her ikisi de sağlanmalı (AND).",
    ],
  },
  {
    title: "Hava Kartları",
    items: [
      "Kart sol çerçevesi TAF modunda TAF kategorisine, METAR modunda METAR kategorisine göre renkleniyor.",
      "Sol çerçeve genişletildi (~18px) ve içine dikey 'TAF' / 'METAR' etiketi eklendi.",
      "Eski '⚠ TAF LIFR' badge'i kaldırıldı; yerine kırmızı fenomen tespitinde 'CRIT TAF' / 'CRIT METAR' badge'i gösteriliyor.",
      "Sarı fenomenler için 'WX TAF' uyarı badge'i eklendi.",
      "TAF ve METAR bölüm etiketleri (TAF / METAR yazıları) kaldırıldı.",
    ],
  },
  {
    title: "Rüzgar Renklendirme",
    items: [
      "Sustained ≥12kt veya gust ≥20kt → turuncu renk.",
      "Sustained ≥15kt veya gust ≥25kt → kırmızı renk.",
      "Düşük değerler için yeşil renk artık gösterilmiyor (nötr).",
    ],
  },
  {
    title: "Fenomen Renklendirme",
    items: [
      "TAF/METAR raw text'te turuncu fenomenler: TS, -TS, TSRA, -TSRA, CB, VCTS, SH, RA ve türevleri, FG, DU, FU, SA, BLDU.",
      "Kırmızı (kritik) fenomenler: +TS, +TSRA, DS, SS, SN ve türevleri, FZRA ve türevleri, GR, GS, VA, FC, SQ, IC, PL.",
      "Alerts sayfasındaki ham metin artık TafText bileşeniyle (satır başı BECMG/TEMPO) render ediliyor.",
    ],
  },
  {
    title: "MONITOR Sayfası",
    items: [
      "Sayfa adı OVERVIEW'dan MONITOR olarak değiştirildi.",
      "İstatistik kartları (TOTAL, UNACK, TAF REV, SPECI) MONITOR sayfasından kaldırılıp ALERTS sayfasına taşındı.",
      "ICAO arama filtresi eklendi — meydanlar kısmi kodla filtrelenebiliyor.",
      "REFRESH butonu eklendi; hava verisi manual olarak yenilenebiliyor.",
      "Monitor bar'da AIRPORTS sayısı kaldırıldı; SCANS günlük sıfırlanıyor (UTC 00:00).",
    ],
  },
  {
    title: "ALERTS Sayfası",
    items: [
      "TOTAL / UNACK / TAF REV / SPECI stat kartları eklendi.",
      "İstatistikler bugün UTC 00:00'dan itibaren ve yalnızca watchlist meydanları için hesaplanıyor.",
      "Saat kartı (UTC + IST) Alerts sayfasına taşındı.",
    ],
  },
  {
    title: "ANALYZE Sayfası (Yeni)",
    items: [
      "Sayfa adı AIRPORTS'tan ANALYZE olarak değiştirildi.",
      "Excel (.xlsx) dosyası yükleme ile uçuş planı analizi eklendi.",
      "Flight, Reg, From ICAO, To ICAO, STA, ETA sütunları okunuyor.",
      "Her uçuş için varış ICAO'sunun ETA ±1 saatlik TAF penceresi analiz ediliyor.",
      "TAF analizi: görüş, tavan, kritik/turuncu fenomenler ve uçuş kategorisi gösteriliyor.",
      "Watchlist yönetimi alt sekmeye taşındı.",
    ],
  },
  {
    title: "Navigasyon",
    items: [
      "Her sekme artık farklı renk: MONITOR (cyan), ALERTS (amber), ANALYZE (emerald).",
      "Logo küçük ekranlarda nav elemanlarının altına düşme sorunu giderildi (3-sütun grid).",
      "Versiyon rozeti v1.8 olarak güncellendi.",
    ],
  },
  {
    title: "Bildirimler",
    items: [
      "Masaüstü bildirimler artık 60 saniye sonra otomatik kapanıyor.",
      "Bildirime tıklamak ekranı öne getiriyor ve bildirimi kapatıyor.",
    ],
  },
  {
    title: "Düzeltmeler",
    items: [
      "Raw METAR/TAF metninde uzun token'larda tek harf satır sonuna düşme sorunu giderildi.",
    ],
  },
];

const V17_SECTIONS = [
  {
    title: "Arayüz (v1.7)",
    items: [
      "Logo yüksek çözünürlüklü renkli versiyona güncellendi ve boyutu küçültüldü.",
      "Sol üste versiyon rozeti eklendi.",
      "UTC ve IST (+3) saatini gösteren canlı saat kartı eklendi.",
      "Açık tema renkleri güçlendirildi; alarm kartları ve ACK uyarılar daha iyi okunuyor.",
    ],
  },
  {
    title: "TAF Görüntüleme (v1.7)",
    items: [
      "PROB30/PROB40 + TEMPO/BECMG satırları doğru gruplandırılıyor.",
      "Düşük görüş değerleri mor (LIFR) renkte gösteriliyor.",
      "Her meydan kartında iki rozet: METAR durumu ve TAF en kötü tahmini.",
    ],
  },
  {
    title: "Filtreler (v1.7)",
    items: [
      "Görünüm seçici: TAF / METAR / TAF+METAR.",
      "TIME butonu ile çoklu zaman dilimi seçimi.",
      "VFR ve MVFR renkleri nötrleştirildi.",
      "Tüm sayfalarda tek tıkla filtre sıfırlama butonu eklendi.",
    ],
  },
  {
    title: "İzleme Sistemi (v1.7)",
    items: [
      "Sabit meydan listesi kaldırıldı; yalnızca watchlist izleniyor.",
      "Watchlist tarayıcıya özel olarak saklanıyor.",
      "Alerts sayfası yalnızca watchlist meydanlarını gösteriyor.",
    ],
  },
];

export function ChangelogModal({ open, onClose }: Props) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  const renderSections = (sections: typeof V18_SECTIONS) =>
    sections.map((section) => (
      <div key={section.title}>
        <h3 className="font-mono text-[11px] font-semibold tracking-widest text-primary uppercase mb-2">
          {section.title}
        </h3>
        <ul className="space-y-1.5">
          {section.items.map((item, i) => (
            <li key={i} className="flex gap-2 text-sm text-muted-foreground leading-snug">
              <span className="text-primary/50 mt-0.5 flex-shrink-0">›</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>
    ));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative z-10 w-full max-w-xl max-h-[85vh] flex flex-col rounded-xl border border-border/60 bg-card shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/40">
          <div>
            <p className="font-mono text-[10px] text-muted-foreground tracking-widest uppercase mb-0.5">
              Güncelleme Notları
            </p>
            <h2 className="font-mono text-lg font-bold text-foreground tracking-tight">
              AERO-SENTINEL <span className="changelog-version-badge">v1.8</span>
            </h2>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto px-6 py-4 space-y-5">
          {/* v1.8 sections */}
          {renderSections(V18_SECTIONS)}

          {/* v1.7 divider */}
          <div className="border-t border-border/40 pt-4">
            <p className="font-mono text-[10px] text-muted-foreground tracking-widest uppercase mb-4">
              — Önceki Güncelleme: v1.7 —
            </p>
            <div className="space-y-5 opacity-60">
              {renderSections(V17_SECTIONS)}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-border/40 flex justify-end">
          <button
            onClick={onClose}
            className="font-mono text-xs px-4 py-1.5 rounded-md bg-muted hover:bg-muted/70 text-muted-foreground hover:text-foreground transition-colors tracking-wider"
          >
            KAPAT
          </button>
        </div>
      </div>
    </div>
  );
}
