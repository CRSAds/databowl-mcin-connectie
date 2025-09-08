// /pages/api/mcincloud-proxy.js
// Start een MCInCloud call. Adaptive schema (flat -> fallback callDetails) en leadId mee in additionalData.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    // Tolerant body parsing (JSON of x-www-form-urlencoded)
    const body = typeof req.body === 'string'
      ? (req.headers['content-type'] || '').includes('application/x-www-form-urlencoded')
        ? Object.fromEntries(new URLSearchParams(req.body))
        : JSON.parse(req.body || '{}')
      : (req.body || {});

    let {
      customerPhoneNumber,
      phone1, // vaak Databowl-veld
      statusCallbackUrl,
      statusCallbackMethod,
      additionalData,
      leadId, // vanuit Databowl meesturen svp
      ...rest
    } = body;

    // 1) Telefoon normaliseren -> E.164 (NL default)
    const normalizePhone = (val) => {
      if (!val) return val;
      let s = String(val).trim().replace(/[\s\-.]/g, '');
      if (s.startsWith('0031')) s = '+' + s.slice(2);
      if (/^31\d+$/.test(s)) s = '+' + s;
      if (/^0\d{9,10}$/.test(s)) s = '+31' + s.slice(1);
      if (!s.startsWith('+')) s = '+' + s; // fallback
      return s;
    };
    const phone = normalizePhone(customerPhoneNumber || phone1 || rest.phone || null);

    // 2) Callback & method defaults
    const host = req.headers.host;
    const fallbackCb = `https://${host}/api/mcincloud-status`;
    const cbUrl = (statusCallbackUrl || process.env.MCINCLOUD_STATUS_CALLBACK_URL || fallbackCb);
    const cbMethod = (statusCallbackMethod || 'POST').toUpperCase();

    // 3) additionalData -> object of null; force leadId als string
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
      addData.leadId = String(leadId); // <<< belangrijk: string voor JToken
    }

    // Validaties
    if (!phone || !phone.startsWith('+')) {
      return res.status(400).json({ error: 'customerPhoneNumber ontbreekt of is ongeldig (verwacht E.164 met +).' });
    }
    if (!/^https?:\/\//i.test(cbUrl)) {
      return res.status(400).json({ error: 'statusCallbackUrl moet een absolute http(s) URL zijn.' });
    }

    // Helper: POST naar MCInCloud
    const postToMC = async (payload) => {
      const r = await fetch('https://api.dev.mcincloud.com/api/v2/calls/enriched', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const text = await r.text();
      let json;
      try { json = JSON.parse(text); } catch { /* non-JSON */ }
      return { status: r.status, text, json };
    };

    // 4) Eerst proberen met "flat" schema (zoals Swagger succesvol was)
    const flatPayload = {
      customerPhoneNumber: phone,
      statusCallbackUrl: cbUrl,
      statusCallbackMethod: cbMethod,
      ...(addData === null ? {} : { additionalData: addData })
    };
    let resp = await postToMC(flatPayload);

    // 5) Indien "callDetails required" -> retry met wrapped schema
    const needsCallDetails =
      resp.status === 400 &&
      resp.json &&
      resp.json.errors &&
      (resp.json.errors.callDetails || String(resp.text || '').includes('callDetails field is required'));

    if (needsCallDetails) {
      const wrappedPayload = {
        callDetails: { customerPhoneNumber: phone },
        statusCallbackUrl: cbUrl,
        statusCallbackMethod: cbMethod,
        ...(addData === null ? {} : { additionalData: addData })
      };
      resp = await postToMC(wrappedPayload);
    }

    // MCInCloud response doorgeven
    if (resp.json) return res.status(resp.status).json(resp.json);
    return res.status(resp.status).send(resp.text || '');

  } catch (err) {
    return res.status(500).json({ error: String(err?.message || err) });
  }
}
