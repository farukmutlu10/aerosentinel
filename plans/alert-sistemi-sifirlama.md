# Alert Bildirim Sistemi — Sıfırdan Yeniden Yazım Planı

## Tespit Edilen Sorunlar

### useAlertNotifications.ts
- `showToastNotification` fonksiyonu artık çağrılmıyor → ÖLÜ KOD
- `isOpera()` fonksiyonu sadece log'da kullanılıyor → GEREKSİZ
- `createNotification` wrapper karmaşık ve gereksiz → BASİTLEŞTİR
- Opera'da `new Notification()` sessizce başarısız olabilir → SW notification kullan

### useAlertSound.ts
- `setupAudioUnlock`, `_audioUnlocked`, `ensureAudioContext`, `_initialized` → ÖLÜ KOD (AudioContext yaklaşımı terk edildi)
- `soundEnabled`, `setEnabled`, `isEnabled` → Kullanılmıyor

### Opera Sorunu
- Opera Chromium tabanlı ama kendi notification yönetimi var
- `new Notification()` Opera'da sessizce başarısız olabilir
- **Çözüm:** Service Worker `showNotification()` kullan → Tüm tarayıcılarda çalışır

## Çözüm Planı

### 1. useAlertNotifications.ts — SIFIRDAN YAZ
- Gereksiz tüm fonksiyonları kaldır
- Service Worker notification kullan (Opera dahil her yerde çalışır)
- Basit ve temiz akış

### 2. useAlertSound.ts — TEMİZLE
- Ölü kodları kaldır
- Sadece WAV beep + Audio element kalsın

### 3. Alerts.tsx — TEMİZLE
- Test panelinden gereksiz import'ları kaldır

## Service Worker Notification Akışı
```
Yeni alert algılandı
  ├─ navigator.serviceWorker.ready bekle
  ├─ registration.showNotification() → her tarayıcıda çalışır
  ├─ Ses çal (WAV beep)
  └─ 30sn sonra otomatik kapat
```

## Dosyalar
1. `artifacts/aero-sentinel/src/hooks/useAlertNotifications.ts` — SIFIRDAN YAZ
2. `artifacts/aero-sentinel/src/hooks/useAlertSound.ts` — TEMİZLE
3. `artifacts/aero-sentinel/src/pages/Alerts.tsx` — TEMİZLE
