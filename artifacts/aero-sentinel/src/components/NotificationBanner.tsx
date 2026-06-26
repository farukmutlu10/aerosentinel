import { useState, useEffect } from "react";

const DISMISSED_KEY = "aero-notif-banner-dismissed";

export function NotificationBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Koşul 1: Cookie consent verilmiş olmalı
    const consentRaw = localStorage.getItem('aero-cookie-consent');
    if (!consentRaw) return;
    
    // Koşul 2: Daha önce dismiss edilmemiş olmalı
    if (localStorage.getItem(DISMISSED_KEY)) return;
    
    // Koşul 3: Notification izni henüz sorulmamış olmalı (sadece "default")
    // EĞER permission "granted" veya "denied" ise → banner GÖSTERME
    // (Kullanıcı zaten kararını vermiş)
    if (typeof Notification === 'undefined') return;
    if (Notification.permission !== 'default') return;
    
    // 2 saniye gecikme — cookie consent banner'ının kapanmasını bekle
    const timer = setTimeout(() => setShow(true), 2000);
    return () => clearTimeout(timer);
  }, []);

  const handleAllow = async () => {
    try {
      await Notification.requestPermission();
    } catch {}
    localStorage.setItem(DISMISSED_KEY, '1');
    setShow(false);
  };

  const handleDismiss = () => {
    localStorage.setItem(DISMISSED_KEY, '1');
    setShow(false);
  };

  if (!show) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[90] p-4 pb-24 sm:pb-4 pointer-events-none">
      <div className="max-w-lg mx-auto bg-card border border-border rounded-xl shadow-2xl p-4 pointer-events-auto">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mt-0.5">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
              <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground">Stay Updated on Weather Alerts</p>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              Get instant browser notifications when TAF/METAR conditions change at your monitored airports.
            </p>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 mt-3">
          <button
            onClick={handleDismiss}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            Not now
          </button>
          <button
            onClick={handleAllow}
            className="px-4 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-bold hover:opacity-90 transition-opacity"
          >
            Allow Notifications
          </button>
        </div>
      </div>
    </div>
  );
}
