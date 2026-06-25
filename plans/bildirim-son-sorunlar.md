# Bildirim Son Sorunlar — Çözüm Planı

## Kök Neden Analizi

### Sorun 1: Doğal Alert Bildirimi Gelmiyor
- `useAlertNotifications` hook'u `useGetRecentAlerts` ile 15sn polling yapıyor
- `customFetch` production'da Railway'e yönlendirme yapıyor
- Eğer API call sessizce başarısız olursa `recent` boş kalıyor
- Kullanıcı konsolda `[AeroNotif]` log'larını göremiyor olabilir

### Sorun 2: Opera'da Popup Açılmıyor
- Opera Chromium tabanlı ama kendi notification yönetimi var
- Opera ayarlarında site notification izni gerekebilir
- `new Notification()` Opera'da çalışmalı ama izin farklı olabilir

### Sorun 3: Test Bildirimi 2 Kez Geliyor (Çözüldü mü?)
- `getGetRecentAlertsQueryKey` invalidation kaldırıldı
- Ama polling hook'u yeni alert'i algılayabilir (aynı alert ID ile)

## Çözüm

### Fix 1: Notification Hook'u Daha Güçlü
- API hatası durumunda bile log yazsın
- `Notification` API'si Opera'da da çalışsın
- `new Notification()` constructor'dan önce Opera kontrolü

### Fix 2: Opera Desteği
- `navigator.userAgent` ile Opera tespiti
- Opera'da fallback: `alert()` veya `console.log`
- Notification izni isteme mekanizmasını güçlendir

### Fix 3: Test Bildirimi Tek Kez
- Test panelinden `getGetRecentAlertsQueryKey` invalidation kaldırıldı (zaten yapıldı)
- Polling hook'u test alert'lerini seenIds'e eklesin (zaten yapıyor)
