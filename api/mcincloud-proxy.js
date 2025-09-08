// /pages/api/mcincloud-proxy.js
// Post naar MCInCloud met verplicht callDetails-schema.
// additionalData.leadId wordt altijd als string gezet als 'leadId' is meegegeven.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    // Tolerant parsen (JSON of x-www-form-urlencoded)
    const body = typeof req.body === 'string'
      ? (req.headers['content-type'] || '').includes('application/x-www-form-urlencoded')
        ? Object.fromEntries(new URLSearchParams(req.body))
        : JSON.parse(req.body || '{}')
      : (req.body || {});

    let {
      customerPhoneNumber,
      phone1,
      statusCallbackUrl,
      statusCallbackMethod,
      additionalData,
      leadId,                // vanuit Databowl
      ...rest
    } = body;

    // 1) Telefoon normaliseren -> E.164 (NL default)
    const normalizePhone = (val) => {
      if (!val) return val;
      let s = String(val).trim().replace(/[\s\-.]/g, '');
      if (s.startsWith('0031')) s = '+' + s.slice(2);
      if (/^31\d+$/.test(s)) s = '+' + s;
      if (/^0\d{9,10}$/.test(s)) s = '+31' + s.slice(1);
      if (!s.startsWith('+')) s = '+' + s;
      return s;
    };
    const phone = normalizePhone(customerPhoneNumber || phone1 || rest.phone || null);

    // 2) Callback & method
    const host = req.headers.host;
    const fallbackCb = `https://${host}/api/mcincloud-status`;
    const cbUrl = (statusCallbackUrl || process.env.MCINCLOUD_STATUS_CALLBACK_URL || fallbackCb);
    const cbMethod = (statusCallbackMethod || 'POST').toUpperCase();

    // 3) additionalData -> object of null; leadId altijd string
    let addData = null;
    if (additionalData === null || additionalData === undefined || additionalData === '') {
      addData = null;
    } else if (typeof additionalData === 'object') {
      addData = additionalData;
    } else if (typeof additionalData === 'string') {
      try {
        const parsed = JSON.parse(additionalData);
        addData = (parsed && typeof parsed === 'object') ? parsed : { raw: String(additionalData) };
      } catch {
        addData = { raw: String(additionalData) };
      }
    }
    if (leadId !== undefined && leadId !== null) {
      addData = addData || {};
      // >>> cruciaal: als string pushen
      addData.leadId = String(leadId);
    }

    // Validaties
    if (!phone || !phone.startsWith('+')) {
      return res.status(400).json({ error: 'customerPhoneNumber ontbreekt of is ongeldig (verwacht E.164 met +).' });
    }
    if (!/^https?:\/\//i.test(cbUrl)) {
      return res.status(400).json({ error: 'statusCallbackUrl moet een absolute http(s) URL zijn.' });
    }

    // 4) Payload: ALTIJD callDetails-schema (past bij jouw 400)
    const outbound = {
      callDetails: { customerPhoneNumber: phone },
      statusCallbackUrl: cbUrl,
      statusCallbackMethod: cbMethod,
      ...(addData === null ? {} : { additionalData: addData })
    };

    // Optionele debug (zet DEBUG=1 als query of env voor echo)
    const debug = (req.query && req.query.debug === '1') || process.env.DEBUG === '1';
    if (debug) {
      console.log('MC payload (wrapped):', JSON.stringify(outbound));
    }

    // 5) Doorposten naar MCInCloud
    const r = await fetch('https://api.dev.mcincloud.com/api/v2/calls/enriched', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(outbound)
    });

    const text = await r.text();
    let json;
    try { json = JSON.parse(text); } catch { /* non-JSON */ }

    if (debug) {
      console.log('MC status:', r.status, 'MC resp:', text);
    }

    if (json) return res.status(r.status).json(json);
    return res.status(r.status).send(text || '');

  } catch (err) {
    return res.status(500).json({ error: String(err?.message || err) });
  }
}
