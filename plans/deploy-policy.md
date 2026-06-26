# Deploy Policy — Preview First

## Kural
Tüm değişiklikler önce **preview** ortamına deploy edilir.
Production deploy SADECE kullanıcı "canlıya al" dediğinde yapılır.

## Frontend (Cloudflare Pages)
- **Preview deploy:** `cd "artifacts/aero-sentinel" && npx pnpm build && npx wrangler pages deploy dist/public --project-name=aerosentinel`
  - URL: `https://preview.aerosentinel.pages.dev`
  - Veya branch-specific: `https://<hash>.aerosentinel.pages.dev`
- **Production deploy:** `cd "artifacts/aero-sentinel" && npx pnpm build && npx wrangler pages deploy dist/public --project-name=aerosentinel --branch=main`
  - URL: `https://aerosentinel.app`

## Backend (Railway)
- Tek Railway instance — preview/production ayrımı yok
- API server değişiklikleri Railway'e deploy edildiğinde direkt production'ı etkiler
- Bu yüzden backend değişiklikleri dikkatli yapılmalı

## Kurallar
1. Hiçbir zaman `--branch=main` ile deploy etme, kullanıcı açıkça "canlıya al" demedikçe
2. Preview'da test edildikten sonra production'a alınır
3. Production deploy öncesi kullanıcıdan onay alınır
4. Preview ve production farklı URL'ler kullanır — birbirini etkilemez
