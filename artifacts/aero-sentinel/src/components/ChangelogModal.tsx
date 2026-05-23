import { useEffect } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
}

const SECTIONS = [
  {
    title: "Arayüz",
    items: [
      "Logo yüksek çözünürlüklü renkli versiyona güncellendi ve boyutu küçültüldü.",
      "Sol üste versiyon rozeti eklendi (v1.7).",
      "UTC ve IST (+3) saatini gösteren canlı saat kartı eklendi (Overview ve Alerts sayfaları).",
      "Açık tema (light mode) renkleri güçlendirildi; alarm kartları ve onaylanmış (ACK) uyarılar daha iyi okunuyor.",
    ],
  },
  {
    title: "TAF Görüntüleme",
    items: [
      "PROB30/PROB40 + TEMPO/BECMG satırları artık tek satırda birleşmiyor, doğru gruplandırılıyor.",
      "TAF'taki 0400 gibi düşük görüş değerleri artık mor (LIFR) renkte gösteriliyor.",
      "Her meydan kartında iki rozet gösteriliyor: anlık METAR durumu ve TAF'ın en kötü tahmini (⚠ TAF LIFR gibi).",
    ],
  },
  {
    title: "Filtreler",
    items: [
      "Görünüm seçici üç seçenekli yapıldı: TAF / METAR / TAF+METAR.",
      "TIME butonu eklendi; birden fazla zaman dilimi aynı anda seçilebiliyor.",
      "TIME seçenekleri aktif görünüme göre değişiyor: TAF seçiliyse TAF zamanları, METAR seçiliyse METAR zamanları listeleniyor.",
      "TIME listesi artık DOM/INT seçimine duyarlı: DOM'da yalnızca Türk meydanlarının, INT'de yalnızca yabancı meydanlarının saat dilimleri gösteriliyor.",
      "TIME listesindeki saat haneleri sarı renkle vurgulanıyor; tarih ve Z harfi daha soluk görünüyor.",
      "VFR ve MVFR renkleri nötrleştirildi; yalnızca IFR (kırmızı) ve LIFR (mor) vurgulu gösteriliyor.",
      "Üç sayfada da (Overview, Alerts, Airports) tek tıkla tüm filtreleri sıfırlayan Reset butonu eklendi.",
    ],
  },
  {
    title: "İzleme ve Uyarı Sistemi",
    items: [
      "Sabit 95 meydanlık liste kaldırıldı; sistem artık yalnızca izleme listesindeki meydanları takip ediyor.",
      "İzleme listesi tarayıcıya özel; her cihazda farklı liste tutulabiliyor.",
      "Sayfa her açıldığında o tarayıcının listesi sisteme anında yükleniyor.",
      "Alerts sayfası artık yalnızca izleme listesindeki meydanların alarmlarını gösteriyor.",
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      {/* Panel */}
      <div
        className="relative z-10 w-full max-w-lg max-h-[80vh] flex flex-col rounded-xl border border-border/60 bg-card shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/40">
          <div>
            <p className="font-mono text-[10px] text-muted-foreground tracking-widest uppercase mb-0.5">
              Güncelleme Notları
            </p>
            <h2 className="font-mono text-lg font-bold text-foreground tracking-tight">
              AERO-SENTINEL <span className="changelog-version-badge">v1.7</span>
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
          {SECTIONS.map((section) => (
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
          ))}
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
