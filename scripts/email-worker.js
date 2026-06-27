// Cloudflare Worker — Contact Form Email API
// Bu worker /api/contact endpoint'inde çalışır

export default {
  async fetch(request, env) {
    // CORS headers
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': 'https://aerosentinel.app',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    try {
      const { name, email, subject, message } = await request.json();

      // Validation
      if (!name || !email || !message) {
        return new Response(JSON.stringify({ error: 'Name, email, and message are required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      // E-posta gönder — Resend API
      const resendResponse = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: `AeroSentinel Contact <contact@aerosentinel.app>`,
          to: ['farukmutlu10@icloud.com'],
          reply_to: email,
          subject: `[AeroSentinel] ${subject || 'Contact Form'}`,
          text: `Name: ${name}\nEmail: ${email}\n\n${message}`,
          html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #f59e0b;">New Contact Form Submission</h2>
              <table style="border-collapse: collapse; width: 100%;">
                <tr><td style="padding: 8px; font-weight: bold;">Name:</td><td style="padding: 8px;">${name}</td></tr>
                <tr><td style="padding: 8px; font-weight: bold;">Email:</td><td style="padding: 8px;"><a href="mailto:${email}">${email}</a></td></tr>
                <tr><td style="padding: 8px; font-weight: bold;">Subject:</td><td style="padding: 8px;">${subject || 'Contact Form'}</td></tr>
              </table>
              <hr style="margin: 16px 0; border: none; border-top: 1px solid #eee;">
              <p style="color: #666;">${message}</p>
              <hr style="margin: 16px 0; border: none; border-top: 1px solid #eee;">
              <p style="color: #999; font-size: 12px;">Sent from AeroSentinel contact form</p>
            </div>
          `,
        }),
      });

      if (!resendResponse.ok) {
        const error = await resendResponse.text();
        return new Response(JSON.stringify({ error: 'Failed to send email', details: error }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ success: true, message: 'Email sent successfully' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });

    } catch (err) {
      return new Response(JSON.stringify({ error: 'Internal server error', details: err.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  },
};
