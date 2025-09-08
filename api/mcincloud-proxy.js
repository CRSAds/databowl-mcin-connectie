// /api/mcincloud-proxy.js
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    // Body tolerant parsen (JSON of urlencoded)
    const body = typeof req.body === 'string'
      ? (req.headers['content-type'] || '').includes('application/x-www-form-urlencoded')
        ? Object.fromEntries(new URLSearchParams(req.body))
        : JSON.parse(req.body || '{}')
      : (req.body || {});

    let {
      customerPhoneNumber,
      phone1,              // vaak Databowl-veld
      statusCallbackUrl,
      statusCallbackMethod,
      additionalData,
      leadId,
      ...rest
    } = body;

    // 1) Telefoon normaliseren → E.164 (NL defaults)
    const normalizePhone = (val) => {
      if (!val) return val;
      let s = String(val).trim().replace(/[\s\-.]/g, '');
      if (s.startsWith('0031')) s = '+' + s.slice(2);
      if (/^31\d+$/.test(s)) s = '+' + s;
      if (/^0\d{9,10}$/.test(s)) s = '+31' + s.slice(1);
      if (!s.startsWith('+')) s = '+' + s; // fallback
      return s;
    };
    customerPhoneNumber = normalizePhone(customerPhoneNumber || phone1 || rest.phone || null);

    // 2) Callback & method
    statusCallbackUrl =
      statusCallbackUrl ||
      process.env.MCINCLOUD_STATUS_CALLBACK_URL ||
      `https://${req.headers.host}/api/mcincloud-status`;

    statusCallbackMethod = (statusCallbackMethod || 'POST').toUpperCase();

    // 3) additionalData → object of null
    let addData = null;
    if (additionalData === null || additionalData === undefined || additionalData === '') {
      addData = null;
    } else if (typeof additionalData === 'object') {
      addData = additionalData;
    } else if (typeof additionalData === 'string') {
      try {
        const parsed = JSON.parse(additionalData);
        addData = (parsed && typeof parsed === 'object') ? parsed : { raw: additionalData };
      } catch {
        addData = { raw: additionalData };
      }
    }

    // Voeg los meegegeven leadId toe als string
    if (leadId !== undefined && leadId !== null) {
      addData = addData || {};
      addData.leadId = String(leadId);
    }

    // 4) Payload conform werkende Swagger (platte body)
    const outbound = {
      customerPhoneNumber,                 // string met +
      statusCallbackUrl,
      statusCallbackMethod,
      ...(addData === null ? {} : { additionalData: addData })
    };

    // Minimale validaties
    if (!outbound.customerPhoneNumber || !outbound.customerPhoneNumber.startsWith('+')) {
      return res.status(400).json({ error: 'customerPhoneNumber ontbreekt of is ongeldig (E.164 met +).' });
    }
    if (!/^https?:\/\//i.test(outbound.statusCallbackUrl)) {
      return res.status(400).json({ error: 'statusCallbackUrl moet http(s) zijn.' });
    }

    // 5) Doorposten naar MCInCloud (JSON)
    const r = await fetch('https://api.dev.mcincloud.com/api/v2/calls/enriched', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(outbound)
    });

    const text = await r.text();
    try { return res.status(r.status).json(JSON.parse(text)); }
    catch { return res.status(r.status).send(text); }

  } catch (err) {
    return res.status(500).json({ error: String(err?.message || err) });
  }
}
