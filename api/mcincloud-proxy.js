// /api/mcincloud-proxy.js
// Flat schema naar MCInCloud. Geen additionalData.
// leadId (DB ID) + leadUid (DB UID) gaan mee als queryparams in statusCallbackUrl.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    // Body tolerant parsen (JSON of x-www-form-urlencoded)
    const rawCT = req.headers['content-type'] || '';
    const body = typeof req.body === 'string'
      ? (rawCT.includes('application/x-www-form-urlencoded')
          ? Object.fromEntries(new URLSearchParams(req.body))
          : JSON.parse(req.body || '{}'))
      : (req.body || {});

    let {
      customerPhoneNumber,
      phone1,
      statusCallbackUrl,
      statusCallbackMethod,
      leadId,   // Databowl Lead ID (numeriek)
      leadUid,  // Databowl Lead UID (string/nummer)
    } = body;

    // 1) Telefoon -> E.164 (+31…)
    const normalizePhone = (val) => {
      if (!val) return val;
      let s = String(val).trim().replace(/[\s\-.]/g, '');
      if (s.startsWith('0031')) s = '+' + s.slice(2);
      if (/^31\d+$/.test(s)) s = '+' + s;
      if (/^0\d{9,10}$/.test(s)) s = '+31' + s.slice(1);
      if (!s.startsWith('+')) s = '+' + s;
      return s;
    };
    const phone = normalizePhone(customerPhoneNumber || phone1 || null);

    // 2) Callback & method
    const host = req.headers.host;
    const baseCb = process.env.MCINCLOUD_STATUS_CALLBACK_URL || `https://${host}/api/mcincloud-status`;
    const cbUrlObj = new URL(statusCallbackUrl || baseCb);
    if (leadId  != null && String(leadId).trim()  !== '') cbUrlObj.searchParams.set('leadId',  String(leadId));
    if (leadUid != null && String(leadUid).trim() !== '') cbUrlObj.searchParams.set('leadUid', String(leadUid));
    const cbUrl = cbUrlObj.toString();

    const cbMethod = (statusCallbackMethod || 'POST').toUpperCase();

    // Validaties
    if (!phone || !phone.startsWith('+')) {
      return res.status(400).json({ error: 'customerPhoneNumber ontbreekt of is ongeldig (E.164 met +).' });
    }
    if (!/^https?:\/\//i.test(cbUrl)) {
      return res.status(400).json({ error: 'statusCallbackUrl moet absolute http(s) zijn.' });
    }

    // 3) Flat payload (bewezen werkend op jouw cluster)
    const outbound = {
      customerPhoneNumber: phone,
      statusCallbackUrl: cbUrl,
      statusCallbackMethod: cbMethod
    };

    // Debug toggle
    const url = new URL(req.url, `https://${host}`);
    const debug = url.searchParams.get('debug') === '1' || process.env.DEBUG === '1';
    if (debug) console.log('PROXY outbound → MCInCloud:', JSON.stringify(outbound));

    // 4) Post naar MCInCloud
    const r = await fetch('https://api.dev.mcincloud.com/api/v2/calls/enriched', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(outbound)
    });

    const text = await r.text();
    if (debug) console.log('MCInCloud response:', r.status, text);

    try { return res.status(r.status).json(JSON.parse(text)); }
    catch { return res.status(r.status).send(text || ''); }

  } catch (err) {
    return res.status(500).json({ error: String(err?.message || err) });
  }
}
