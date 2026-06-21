// Cloudflare Pages Middleware
// Bakım modu artık _redirects dosyasından yönetiliyor.
// Bu dosya gelecekteki middleware ihtiyaçları için boş bırakılmıştır.

export async function onRequest(context) {
  return context.next();
}
