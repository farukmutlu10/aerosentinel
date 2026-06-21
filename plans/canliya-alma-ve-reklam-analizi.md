# AERO-SENTINEL Canlıya Alma ve Reklam Modülü Analiz Raporu

## 1. Mevcut Durum Özeti

### 1.1. Mimari Yapı

```
┌─────────────────────────────────────────────────────────┐
│                   MONOREPO (pnpm workspace)              │
├───────────────────┬───────────────────┬─────────────────┤
│  artifacts/      │  lib/             │  plans/scripts  │
│  aero-sentinel   │  api-server       │                  │
│  (React+Vite)    │  (Express+ESM)    │                  │
├───────────────────┼───────────────────┼─────────────────┤
│  Sayfalar:        │  Routes:          │  Paylaşılan:    │
│  MONITOR (/)      │  /api/alerts     │  api-client     │
│  ALERTS (/alerts) │  /api/watchlist  │  api-zod        │
│  ANALYZE          │  /api/airports   │  db (Drizzle)   │
│  AirportDetail    │  /api/monitor    │  api-spec       │
└───────────────────┴───────────────────┴─────────────────┘
```

### 1.2. Teknoloji Yığını

| Katman | Teknoloji | Versiyon |
|--------|-----------|----------|
| Frontend Framework | React | 19.1.0 |
| Build Tool | Vite | 7.3.x |
| Styling | Tailwind CSS v4 | 4.1.x |
| Routing | wouter | 3.3.x |
| State/Data | TanStack Query | 5.90.x |
| Backend | Express | 5.2.x |
| ORM | Drizzle ORM | 0.45.x |
| Database | PostgreSQL | - |
| Validation | Zod | 3.25.x |
| Logging | Pino | 9.x |
| API Client | Orval (auto-generated) | - |
| Package Manager | pnpm | 11.x |

### 1.3. Mevcut Sayfalar ve Kullanıcı Akışı

```
HOME (/) ──► MONITOR Dashboard
  ├── Watchlist yönetimi
  ├── TAF/METAR hava durumu kartları
  ├── Filtreleme (kategori, DOM/INT, sort, zaman)
  └── Desktop notification banner

ALERTS (/alerts)
  ├── İstatistik kartları (Total, Unack, TAF Rev, SPECI)
  ├── Alert listesi (ACK butonları ile)
  └── Filtreleme (tip, DOM/INT, sort, hide-ack)

ANALYZE (/airports)
  ├── Excel upload (.xlsx/.xls/.csv)
  ├── Uçuş tablosu (Flight, Reg, From, To, ETD, ETA)
  └── TAF analizi (IFR/LIFR/CRIT tespiti)

Airport Detail (/airports/:icao)
  ├── TAF ve METAR görüntüleme
  └── Alert geçmişi
```

---

## 2. CANLIYA ALMA (PRODUCTION DEPLOYMENT) ANALİZİ

### 2.1. Gereksinimler

#### 2.1.1. Domain (Alan Adı)
```
Öneri: aerosentinel.com veya aerosentinel.app
       .com  ~$12/yıl
       .app  ~$15/yıl (HTTPS zorunlu)
       .io   ~$40/yıl
```

#### 2.1.2. Hosting Seçenekleri

| Sağlayıcı | Frontend | Backend | DB | Aylık Maliyet | Notlar |
|-----------|----------|---------|-----|---------------|--------|
| **Railway** | ✓ Statik | ✓ Container | ✓ PostgreSQL | $5-20 | Basit deploy, otomatik SSL |
| **Render** | ✓ Static | ✓ Web Service | ✓ PostgreSQL | $7-15 | Kolay kurulum |
| **Fly.io** | ✓ | ✓ Container | ✓ PostgreSQL | $5-25 | Global dağıtım |
| **DigitalOcean App Platform** | ✓ | ✓ Container | ✓ Managed DB | $12-30 | Stabil |
| **Vercel** | ✓ (Frontend) | ✗ (Serverless) | ✗ | Ücretsiz (FE) | Backend ayrı gerekir |
| **AWS (ECS+RDS)** | ✓ | ✓ ECS | ✓ RDS | $30-100+ | Kompleks, ölçeklenebilir |
| **Hetzner + Docker** | ✓ | ✓ VPS | ✓ Self-hosted | $5-15 | Ek yönetim gerektirir |

**Öneri:** Railway veya Render — en hızlı deploy, otomatik SSL, managed PostgreSQL, uygun fiyat.

#### 2.1.3. Production Database Migration (KRİTİK)

Mevcut [`lib/db/src/index.ts`](lib/db/src/index.ts:71-78) in-memory fallback kullanıyor.
Production'da **gerçek PostgreSQL** şart:
- Railway/Render: Built-in PostgreSQL (otomatik)
- DigitalOcean: Managed DB ($15/ay ek)
- DIY: PostgreSQL on VPS

```mermaid
flowchart LR
    subgraph Development
        A[Local PostgreSQL] --> B[Drizzle Migrations]
        B --> C[SQL Migration Files]
    end
    subgraph Production
        C --> D[Production PostgreSQL]
        D --> E[API Server]
    end
```

#### 2.1.4. Environment Variables (Production)

```env
# Backend (.env)
DATABASE_URL=postgresql://user:pass@host:5432/aerosentinel
PORT=5001
NODE_ENV=production
# Frontend build argümanları
VITE_API_URL=https://api.aerosentinel.com
```

---

### 2.2. Deploy Stratejisi

#### Seçenek A: Railway (Önerilen - En Kolay)

```mermaid
flowchart TD
    A[GitHub Push] --> B[Railway Auto-Deploy]
    B --> C[Build Frontend]
    B --> D[Build Backend]
    C --> E[Static Site]
    D --> F[Web Service]
    E --> G[aerosentinel.com]
    F --> H[api.aerosentinel.com/api/*]
    I[Railway PostgreSQL] --> F
```

**Adımlar:**
1. GitHub repo oluştur, kodu pushla
2. Railway'de yeni proje → "Deploy from GitHub repo"
3. Backend: `nixpacks.toml` veya Dockerfile ile deploy
4. Frontend: Static site olarak deploy (Vite build)
5. PostgreSQL database oluştur (Railway built-in)
6. Custom domain bağla (aerosentinel.com)
7. SSL otomatik gelir

**Backend Dockerfile** (gerekiyorsa):
```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY . .
RUN npm install -g pnpm
RUN pnpm install
RUN pnpm --filter @workspace/api-server build
EXPOSE 5001
CMD ["node", "artifacts/api-server/dist/index.mjs"]
```

#### Seçenek B: Vercel + Railway (Frontend/Backend ayrı)

```mermaid
flowchart TD
    A[Vercel - Frontend] --> B[Rails API Proxy]
    B --> C[Railway - Backend]
    C --> D[Railway PostgreSQL]
```

- Frontend → Vercel (ücretsiz, otomatik SSL, global CDN)
- Backend → Railway ($5-20/ay)
- Vercel'de `vercel.json` ile API proxy yönlendirmesi

#### Seçenek C: DigitalOcean App Platform

- Tek platformda frontend + backend + managed DB
- `app.yaml` veya DO Console ile deploy
- Container registry desteği

---

### 2.3. Production Build Konfigürasyonu

Frontend build çıktısı: [`artifacts/aero-sentinel/vite.config.ts:57-59`](artifacts/aero-sentinel/vite.config.ts:57-59)
```typescript
build: {
  outDir: path.resolve(import.meta.dirname, "dist/public"),
  emptyOutDir: true,
}
```

Backend build: [`artifacts/api-server/build.mjs`](artifacts/api-server/build.mjs)
- esbuild ile bundle
- Çıktı: `artifacts/api-server/dist/index.mjs`

**GitHub Actions CI/CD örneği:**
```yaml
name: Deploy
on:
  push:
    branches: [main]
jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
        with: { node-version: '22' }
      - run: pnpm install
      - run: pnpm build
      # Deploy to Railway/Render vs.
```

---

### 2.4. Production Hazırlık Kontrol Listesi

#### Kritik (Yapılması ŞART)

- [ ] **Database migration** — In-memory fallback production'da KULLANILMAMALI
- [ ] **Hata düzeltmeleri** — Önceki raporda belirtilen buglar fixlenmeli:
  - `@ts-nocheck` kaldırılmalı ([`lib/db/src/index.ts:1`](lib/db/src/index.ts:1))
  - Express v5'in tam uyumluluğu test edilmeli
  - [`not-found.tsx`](artifacts/aero-sentinel/src/pages/not-found.tsx) tema uyumlu hale getirilmeli
- [ ] **Domain + SSL** — Let's Encrypt otomatik (Railway/Render/Vercel)
- [ ] **Environment variables** — Tüm production değişkenleri ayarlanmalı
- [ ] **CORS config** — Production domain'e göre güncellenmeli ([`artifacts/api-server/src/app.ts:30`](artifacts/api-server/src/app.ts:30))
- [ ] **Loglama** — Pino production formatına geçirilmeli

#### Önemli (Yapılması TAVSİYE EDİLİR)

- [ ] **Rate limiting** — API'ye rate limiter eklenmeli (express-rate-limit)
- [ ] **Helmet** — Security headers (helmet middleware)
- [ ] **Compression** — Gzip compression (compression middleware)
- [ ] **Health check** — `/api/healthz` endpoint'i monitoring için kullanılmalı
- [ ] **Process manager** — PM2 veya built-in clustering
- [ ] **Monitoring** — Sentry veya类似 error tracking
- [ ] **Backup** — PostgreSQL otomatik yedekleme (Railway/Render built-in)
- [ ] **CDN** — Static assets için CDN (Vite build çıktıları)

#### İyi Olur (İleri Seviye)

- [ ] **Redis cache** — API yanıtları için Redis cache katmanı
- [ ] **DDoS protection** — Cloudflare DNS + WAF
- [ ] **CI/CD pipeline** — Otomatik test + deploy
- [ ] **Staging environment** — Canlı öncesi test ortamı
- [ ] **Analytics** — Google Analytics veya Plausible (gizlilik odaklı)

---

### 2.5. Maliyet Tahmini (Aylık)

| Kalem | En Düşük | Orta | Yüksek |
|-------|----------|------|--------|
| Domain (yıllık/12) | $1 | $1 | $3 |
| Hosting (FE+BE+DB) | $5 (Railway) | $15 (Render) | $30 (DO) |
| Monitoring | $0 (built-in) | $10 (Sentry) | $29 (Datadog) |
| CDN | $0 (built-in) | $0 | $10 |
| **Toplam** | **~$6/ay** | **~$26/ay** | **~$72/ay** |

---

## 3. REKLAM MODÜLÜ ANALİZİ

### 3.1. Reklam Stratejisi Seçenekleri

#### Seçenek 1: Google AdSense (Önerilen - Pasif Gelir)

**Avantajları:**
- Kolay entegrasyon (JS snippet)
- Otomatik reklam yerleşimi (Auto Ads)
- Düşük yönetim maliyeti
- Hemen hemen her hosting sağlayıcısında çalışır

**Dezavantajları:**
- Düşük TBM (havacılık nişinde $1-5 CPM)
- Reklam görünümü üzerinde sınırlı kontrol
- Sayfa hızını etkileyebilir
- Reklam engelleyiciler tarafından bloklanır
- Onay süreci gerekli (site canlı olmalı)

**Tahmini Gelir:** ~$2-20/1.000 sayfa görüntüleme (CPM $1-10)

#### Seçenek 2: Premium Doğrudan Reklam (Önerilen - Yüksek Gelir)

Havacılık sektörüne yönelik premium reklam alanları:
- Havayolu şirketleri (THY, Pegasus, SunExpress, AnadoluJet)
- Uçak kiralama şirketleri (ACMI)
- Pilot eğitim kurumları
- Havacılık ekipman tedarikçileri
- Yer hizmetleri şirketleri

**Fiyatlandırma Modeli:**
```
Sponsorluk (aylık): $500-2.000/ay
  ├── Hero Banner (header) - $500/ay
  ├── Sidebar Banner - $300/ay
  ├── Page Sponsor (örn: ALERTS sayfası) - $1.000/ay
  └── Premium Sponsor (tüm sayfalar) - $2.000/ay

Tekil Reklam (CPA/CPM):
  ├── Dashboard'da öne çıkan kart - $0.50 CPM
  └── Analiz sayfasında banner - $0.30 CPM
```

#### Seçenek 3: Affiliate Marketing (Ortaklık)

Havacılık ile ilgili ürünlerin affiliate linkleri:
- **Uçuş ekipmanları** (headset, tablet holder → Sporty's, MyPilotPro)
- **Havacılık yazılımları** (ForeFlight, Garmin Pilot → affiliate program)
- **Eğitim materyalleri** (pilot kitapları, online kurslar)
- **Seyahat sigortası** (Allianz, AXA → affiliate)

#### Seçenek 4: Premium Üyelik Modeli (Opsiyonel)

```
Ücretsiz Kullanıcı:
  ├── Reklam gösterimi
  ├── Sınırlı watchlist (10 meydan)
  └── Temel TAF/METAR görüntüleme

Premium Kullanıcı ($9.99/ay veya $99/yıl):
  ├── Reklamsız deneyim
  ├── Sınırsız watchlist
  ├── SMS/Email alert bildirimleri
  ├── Excel export (analiz verileri)
  ├── API erişimi (kişisel token)
  └── TAF değişiklik geçmişi
```

---

### 3.2. Önerilen Reklam Yerleşimleri

```
┌──────────────────────────────────────────────────────────────┐
│  [NAV HEADER - Logo]  [MONITOR] [ALERTS] [ANALYZE]  [Sponsor]│
├──────────────┬───────────────────────────────────────────────┤
│              │                                               │
│  [SIDEBAR]   │         [MAIN CONTENT]                       │
│  Banner AD   │                                               │
│  300x250     │  ┌─────────────────────────────────────────┐  │
│              │  │  Weather Card 1    Weather Card 2        │  │
│  [SKYSCRAPER]│  │  [Native AD]       Weather Card 4        │  │
│  160x600     │  └─────────────────────────────────────────┘  │
│              │                                               │
│              │  ┌─────────────────────────────────────────┐  │
│              │  │  [IN-FEED AD]                           │  │
│              │  └─────────────────────────────────────────┘  │
├──────────────┴───────────────────────────────────────────────┤
│  [FOOTER]                                        [Footer AD] │
└──────────────────────────────────────────────────────────────┘
```

#### Detaylı Yerleşim Planı:

| Konum | Sayfa | Format | Boyut | Öncelik |
|-------|-------|--------|-------|---------|
| Sponsor badge | TÜM (NavHeader) | Logo+Text | 120x30 | YÜKSEK |
| In-feed kart | MONITOR Dashboard | Native kart | Responsive | YÜKSEK |
| In-feed kart | ALERTS listesi | Native kart | Responsive | ORTA |
| Banner alt | ANALYZE tablosu altı | Banner | 728x90 | ORTA |
| Sidebar | Airport Detail | Banner | 300x250 | DÜŞÜK |

---

### 3.3. Teknik Uygulama

#### 3.3.1. Reklam Bileşen Mimarisi

```typescript
// artifacts/aero-sentinel/src/components/ads/AdSlot.tsx
interface AdSlotProps {
  /** Benzersiz reklam konum ID'si */
  slot: 'monitor-infeed' | 'alerts-infeed' | 'analyze-footer' | 'detail-sidebar';
  /** Responsive boyut */
  size?: 'leaderboard' | 'medium-rectangle' | 'skyscraper' | 'native';
  /** Premium sponsor override */
  sponsor?: { name: string; logo: string; url: string } | null;
}

function AdSlot({ slot, size, sponsor }: AdSlotProps) {
  if (isPremiumUser) return null; // Premium kullanıcı reklam görmez
  if (sponsor) return <SponsorCard sponsor={sponsor} />;
  return <AdSenseSlot slotId={slot} size={size} />;
}
```

#### 3.3.2. Veritabanı Şeması (Sponsor/Ad Management)

```sql
-- Premium sponsorlar
CREATE TABLE sponsors (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  logo_url TEXT,
  website_url TEXT NOT NULL,
  contract_start TIMESTAMP NOT NULL,
  contract_end TIMESTAMP NOT NULL,
  monthly_rate DECIMAL(10,2) NOT NULL,
  is_active BOOLEAN DEFAULT true
);

-- Sponsor reklam yerleşimleri
CREATE TABLE sponsor_placements (
  id SERIAL PRIMARY KEY,
  sponsor_id INTEGER REFERENCES sponsors(id),
  slot_key TEXT NOT NULL, -- 'monitor-infeed', 'alerts-infeed'
  page_path TEXT, -- null = tüm sayfalar
  priority INTEGER DEFAULT 1,
  is_active BOOLEAN DEFAULT true
);

-- Reklam gösterim logları (raporlama için)
CREATE TABLE ad_impressions (
  id SERIAL PRIMARY KEY,
  sponsor_id INTEGER REFERENCES sponsors(id),
  slot_key TEXT NOT NULL,
  viewer_ip TEXT,
  viewed_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE ad_clicks (
  id SERIAL PRIMARY KEY,
  impression_id INTEGER REFERENCES ad_impressions(id),
  clicked_at TIMESTAMP DEFAULT NOW()
);
```

#### 3.3.3. AdSense Entegrasyon Kodu

```html
<!-- index.html - head -->
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js">
</script>

<!-- React bileşeni -->
const AdSenseSlot = ({ slotId, size }: { slotId: string; size: string }) => {
  useEffect(() => {
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch (e) { /* sessiz */ }
  }, []);

  return (
    <ins className="adsbygoogle"
      style={{ display: 'block' }}
      data-ad-client="ca-pub-XXXXXXXXXXXXXXXX"
      data-ad-slot={SLOT_MAP[slotId]}
      data-ad-format={size === 'native' ? 'fluid' : 'auto'}
      data-full-width-responsive="true"
    />
  );
};
```

#### 3.3.4. Reklam Engelleyici Tespiti

```typescript
// hooks/useAdBlocker.ts
export function useAdBlocker() {
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    const test = document.createElement('div');
    test.className = 'ad-test';
    test.style.position = 'absolute';
    test.style.height = '1px';
    document.body.appendChild(test);
    requestAnimationFrame(() => {
      if (test.offsetHeight === 0) setBlocked(true);
      test.remove();
    });
  }, []);

  return { adblockDetected: blocked };
}
```

---

### 3.4. Reklam Modülü Uygulama Planı

#### Faz 1: Temel Altyapı (1-2 Hafta)
```
[ ] AdPlacement bileşeni oluşturma
[ ] AdSense snippet entegrasyonu
[ ] Sponsor veritabanı tabloları
[ ] Admin API endpoint'leri (CRUD sponsor)
[ ] Gösterim/tıklama loglama
```

#### Faz 2: Premium Sponsor Sistemi (1-2 Hafta)
```
[ ] Sponsor yönetim paneli
[ ] Sponsor rotasyonu (round-robin)
[ ] Sponsor görsel/içerik yönetimi
[ ] Raporlama dashboard'u
[ ] Fatura/PDF oluşturma
```

#### Faz 3: Premium Üyelik (2-3 Hafta, opsiyonel)
```
[ ] Kullanıcı kayıt/giriş sistemi (Auth0 veya custom)
[ ] Ödeme entegrasyonu (Stripe)
[ ] Premium/ücretsiz feature flag sistemi
[ ] Kullanıcı paneli
[ ] Abonelik yönetimi
```

---

### 3.5. Önerilen Adım Adım Yol Haritası

```mermaid
gantt
    title AeroSentinel Production + Reklam Yol Haritası
    dateFormat  YYYY-MM-DD
    section Production
    Bug fix'leri ve cleanup          :a1, 2026-06-15, 7d
    Dockerfile + deploy config       :a2, after a1, 3d
    Railway/Render deploy            :a3, after a2, 2d
    Domain + SSL + Test              :a4, after a3, 2d
    
    section Reklam
    AdSense başvuru + onay          :b1, 2026-06-15, 14d
    AdSlot bileşeni + entegrasyon   :b2, after b1, 5d
    Sponsor DB + API                :b3, after b2, 5d
    Admin panel                     :b4, after b3, 7d
    
    section Premium (Opsiyonel)
    Kullanıcı auth sistemi          :c1, after b4, 7d
    Stripe entegrasyonu             :c2, after c1, 5d
    Premium feature flags           :c3, after c2, 5d
```

---

## 4. ÖZET VE TAVSİYELER

### Hemen Yapılması Gerekenler:

1. **🔴 Önce bug fix** — Production'a çıkmadan önce [`lib/db/src/index.ts`](lib/db/src/index.ts:1) ve diğer kritik hatalar düzeltilmeli
2. **🟡 Railway ile deploy** — En hızlı ve en kolay production çözümü (ilk ay ücretsiz, sonra $5-20/ay)
3. **🟢 AdSense başvurusu** — Hemen yapılmalı, onay 1-2 hafta sürebilir
4. **🟢 Domain alınmalı** — `aerosentinel.com` veya benzeri

### İlk 1 Ay İçinde:

5. **Premium sponsor sistemi** — Havacılık şirketlerine sponsorluk paketi sunulmalı
6. **SEO optimizasyonu** — Meta tags, Open Graph, XML sitemap
7. **Analytics** — Kullanıcı istatistikleri için Plausible/GA4

### 3. Ayda:

8. **Premium üyelik** — Kullanıcı tabanı belli bir büyüklüğe ulaştıysa ($9.99/ay)
9. **Mobil uygulama** — React Native veya PWA

---

## 5. EKLER

### A. Gerekli npm Paketleri (Yeni)

```json
{
  "dependencies": {
    "express-rate-limit": "^7.0.0",
    "helmet": "^8.0.0",
    "compression": "^1.8.0",
    "stripe": "^17.0.0"
  },
  "devDependencies": {
    "@types/compression": "^1.7.5"
  }
}
```

### B. AdSense Onay Süreci

1. Site canlıya alınır
2. AdSense'e başvurulur (google.com/adsense)
3. Onay için 1-14 gün beklenir
4. Onay sonrası AdSense kodları siteye eklenir
5. Reklamlar otomatik gösterilmeye başlar

### C. Potential Sponsor Listesi (Türkiye Havacılık)

| Şirket | Kategori | Potansiyel Bütçe |
|--------|----------|------------------|
| THY (Turkish Airlines) | Havayolu | $2.000-5.000/ay |
| Pegasus | Havayolu | $1.000-3.000/ay |
| SunExpress | Havayolu | $1.000-2.000/ay |
| AnadoluJet | Havayolu | $500-1.500/ay |
| Ajet | Havayolu | $500-1.000/ay |
| Turkish Technic | Bakım | $500-1.000/ay |
| Flight Simulation Turkey | Eğitim | $200-500/ay |
| DHMİ (Devlet Hava Meydanları) | Resmi | $1.000-3.000/ay |