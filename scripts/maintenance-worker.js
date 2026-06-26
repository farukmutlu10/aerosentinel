// Cloudflare Worker — Bakım Modu Kontrolü
// Bu Worker, MAINTENANCE_MODE değişkenine bakarak
// bakım sayfasını veya normal uygulamayı sunar.

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Bakım modu açıksa tüm istekleri bakım sayfasına yönlendir
    if (env.MAINTENANCE_MODE === 'true') {
      // API isteklerini engelle (503 Service Unavailable)
      if (url.pathname.startsWith('/api/')) {
        return new Response(
          JSON.stringify({ error: 'Bakım modunda', retry_after: 3600 }),
          { status: 503, headers: { 'Content-Type': 'application/json' } }
        );
      }
      // Diğer istekleri bakım sayfasına yönlendir
      return Response.redirect(`${url.origin}/maintenance.html`, 302);
    }

    // Bakım modu kapalıysa normal uygulamayı sun
    return fetch(request);
  }
};
