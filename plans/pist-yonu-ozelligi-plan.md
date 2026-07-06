# Pist Yönü (Runway Heading) Özelliği — Uygulama Planı

## Özet

Dashboard ve alert kartlarında her meydanın pist yönlerini (ör. "16L/34R · 16R/34L") kompakt bir rozet olarak göstermek; rozete tıklanınca pist uzunluğu, manyetik/gerçek derece ve yüzey tipi gibi detayları bir popover'da açmak. Wind calculator (rüzgar bileşeni hesaplayıcı) bu planın kapsamı **dışında** — ayrı bir sonraki faz.

---

## 1. Mevcut Durum (araştırma sonucu)

- DB'de `airports`/`runways` tablosu **yok**. Mevcut tablolar (`lib/db/src/schema/`): `watchlist` (icao, userId), `monitor_cache` (icao, rawText), `alerts` (icao, rawText, ...) — hiçbirinde geo veya pist verisi yok.
- Tek statik referans veri seti: `artifacts/aero-sentinel/src/lib/iataMap.ts` — OurAirports'tan üretilmiş ICAO→IATA sözlüğü (7736 havalimanı). **Bu, aynı deseni pist verisi için de kullanabileceğimizin kanıtı.**
- `lib/api-spec/openapi.yaml`: `Airport` şeması sadece `{icao, alertCount, lastAlert, status}`; `TafData`/`MetarData` sadece ham metin (`rawTaf`/`rawMetar`). Rüzgar yönü dahi API'de yapılandırılmış alan olarak yok — frontend'de `metarParser.ts` ham METAR'dan parse ediyor.
- Kartlar: `Dashboard.tsx:1064-1070` başlık satırı `{icao} <IataBadge/>` düzeninde; `AirportDetail.tsx:86-90` benzer. Bu satırlara yeni rozet eklemek düşük riskli, mevcut desenle birebir uyumlu.
- Önceki emsal: `plans/iata-kodu-ozelligi-plan.md` — aynı "OurAirports statik veri + küçük Badge bileşeni" yaklaşımının IATA kodu için nasıl uygulandığını gösteriyor. Bu plan aynı şablonu izliyor.

---

## 2. Karar Verilen Tercihler

| Konu | Karar |
|---|---|
| Veri kaynağı | **OurAirports** açık veri seti (`runways.csv` + `airports.csv`, ICAO/`ident` ile join) |
| Kartta gösterim | **Seçenek A** — ICAO/IATA rozetinin hemen yanında satır içi kompakt rozet: `LTFM [IST] [16L/34R · 16R/34L]` |
| Detay | Rozete tıklayınca popover: her pist için derece (ör. 163°/343°), uzunluk (m), yüzey tipi |
| Kapsam | Dashboard kartları **ve** alert kartları |
| Wind calculator | Şimdilik **yapılmayacak** — sadece veri altyapısı ve gösterim bu fazda |

---

## 3. Mimari Yaklaşım

**Veri statik ve nadiren değişir** (yeni pist inşası yıllar sürer) → DB migration yerine, `iataMap.ts` ile aynı desen: build-time'da üretilen statik veri dosyası. Ama boyut nedeniyle **backend'de** tutulacak (frontend bundle'ını şişirmemek için):

```
scripts/generate-runway-data.mjs   → OurAirports CSV indirir, ICAO bazında join eder, JSON üretir
artifacts/api-server/src/data/runways.json   → checked-in statik veri (ICAO → pist listesi)
artifacts/api-server/src/lib/runways.ts      → getRunways(icao) lookup fonksiyonu
```

**API katmanı — GÜNCELLEME (implementasyon sonrası gerçek karar):** Plan aşamasında "mevcut response'lara ekle" düşünülmüştü, ama uygulamada daha düşük riskli bir yol seçildi: `GET /api/airports/:icao/runways` adında **ayrı, salt-okunur bir endpoint** eklendi (`artifacts/api-server/src/routes/airports.ts`). Gerekçe: `monitor.ts`daki canlı tarama pipeline'ına ve `Alert`/`Airport`/`TafData`/`MetarData` şemalarına hiç dokunmadan, sıfır ek risk ile eklenebiliyor. Bu endpoint OpenAPI spesine dahil edilmedi (watchlist/weather ile aynı şekilde ham `fetch` ile çağrılıyor, Orval regen gerekmiyor). Frontend'de `useRunways(icao)` hook'u (`staleTime: Infinity`) her benzersiz ICAO için bunu bir kez çekip sonsuza kadar cache'liyor — pratikte watchlist/weather'a gömmekle aynı ağ verimliliğini sağlıyor, çok daha az dosyaya dokunarak.

**Frontend katmanı**:
- `components/RunwayBadge.tsx` — `IataBadge.tsx` ile birebir aynı desen: kompakt rozet + tıklanınca `Popover` (shadcn `popover.tsx` zaten mevcut) açar.
- **Kritik teknik not**: Dashboard kartının tamamı bir `<Link>` (`Dashboard.tsx:1053`). Rozete tıklayınca sayfa yönlendirmesini tetiklemesin diye `onClick`'te `e.preventDefault(); e.stopPropagation()` şart. Aynı kontrol alert kartları için de uygulanacak (tıklanabilir alert satırları varsa).
- Entegrasyon noktaları: `Dashboard.tsx:1069` (IataBadge yanı), `AirportDetail.tsx:89`, alert kartlarının render edildiği yer (`Alerts.tsx` sayfası / ilgili liste bileşeni — kesin dosya implementasyon aşamasında teyit edilecek).
- Pist verisi eksikse (bazı küçük meydanlarda OurAirports'ta heading boş olabilir) rozet sessizce gizlenir — `IataBadge`'in `hideIfMissing` deseniyle aynı.

---

## 4. Uygulama Adımları (implementasyon aşamasında)

1. `scripts/generate-runway-data.mjs` yaz, OurAirports verisini indir/parse et, `artifacts/api-server/src/data/runways.json` üret.
2. `artifacts/api-server/src/lib/runways.ts` — `getRunways(icao): Runway[]` lookup.
3. `openapi.yaml` — ilgili response şemalarına `runways` alanı ekle → `pnpm run generate` (lib/api-spec).
4. Backend response builder'ları güncelle (monitor/watchlist-weather ve alert endpoint'leri) — `getRunways` ile zenginleştir.
5. `components/RunwayBadge.tsx` — kompakt rozet + Popover detay (mockup'taki "Seçenek A" tasarımı).
6. Dashboard, AirportDetail ve alert kartlarına `<RunwayBadge icao={icao} runways={...} />` ekle.
7. Test: pist verisi olan/olmayan meydanlarla, watchlist ve alert akışlarında manuel doğrulama.

## 5. Kapsam Dışı (Faz 2)

- Wind calculator: aktif METAR rüzgarına göre crosswind/headwind bileşeni hesaplama, en uygun pisti önerme. Bu, bu plandaki `headingDegT` verisine bağımlı olacak — veri altyapısı bu fazda hazırlanıyor ama hesaplama/UI Faz 2'de.
- Not: OurAirports heading değerleri **gerçek (true) derece** — manyetik sapma (magnetic variation) uygulanmadan gösterilecek; Faz 2'de rüzgar hesaplaması için bu ayrım önem kazanacak.
