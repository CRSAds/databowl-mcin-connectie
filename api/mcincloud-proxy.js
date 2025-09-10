// /api/mcincloud-proxy.js
// Doel: Flat schema naar MCInCloud sturen (bewezen werkend) en identifiers
// (leadId/leadUid) zowel in de callback-URL als in additionalData meesturen,
// zodat de status-callback ze altijd terugstuurt.
//
// Query toggles:
//  - ?debug=1  → extra logging naar Vercel logs
//  - ?dry=1    → geen externe call; geeft de outbound payload terug (voor testen)

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

    // Inkomende velden vanuit Databowl
    let {
      customerPhoneNumber,
      phone1,                    // soms zo genoemd
      statusCallbackUrl,
      statusCallbackMethod,
      // identifiers (LET OP: Forwarding moet Lead ID/UID mappen naar deze namen)
      leadId,                    // numerieke Databowl Lead ID
      leadUid                    // Databowl Lead UID
    } = body;

    // 1) Telefoon normaliseren naar E.164 (NL default)
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

    // 2) Callback-URL opbouwen (inclusief leadId/leadUid in query)
    const host = req.headers.host;
    const baseCb = process.env.MCINCLOUD_STATUS_CALLBACK_URL || `https://${host}/api/mcincloud-status`;
    const cbUrlObj = new URL(statusCallbackUrl || baseCb);
    if (leadId  != null && String(leadId).trim()  !== '') cbUrlObj.searchParams.set('leadId',  String(leadId));
    if (leadUid != null && String(leadUid).trim() !== '') cbUrlObj.searchParams.set('leadUid', String(leadUid));
    const cbUrl = cbUrlObj.toString();

    const cbMethod = (statusCallbackMethod || 'POST').toUpperCase();

    // 3) Validaties
    if (!phone || !phone.startsWith('+')) {
      return res.status(400).json({ error: 'customerPhoneNumber ontbreekt of is ongeldig (E.164 met +).' });
    }
    if (!/^https?:\/\//i.test(cbUrl)) {
      return res.status(400).json({ error: 'statusCallbackUrl moet absolute http(s) zijn.' });
    }

   // 5) Definitieve payload: flat schema
    const outbound = {
      customerPhoneNumber: phone,
      statusCallbackUrl: cbUrl,
      statusCallbackMethod: cbMethod,
    };

    // Query toggles
    const reqUrl = new URL(req.url, `https://${host}`);
    const debug = reqUrl.searchParams.get('debug') === '1' || process.env.DEBUG === '1';
    const dry   = reqUrl.searchParams.get('dry') === '1';

    if (debug) {
      console.log('INBOUND body from Databowl:', JSON.stringify(body));
      console.log('PROXY outbound → MCInCloud:', JSON.stringify(outbound));
    }

    // 6) Dry-run (geen externe call)
    if (dry) return res.status(200).json({ ok: true, mode: 'dry-run', outbound });

    // 7) Post naar MCInCloud
    const r = await fetch('https://api.mcincloud.com/api/v2/calls/enriched', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(outbound)
    });

    const text = await r.text();
    if (debug) console.log('MCInCloud response:', r.status, text);

    // transparante doorzetting van response
    try { return res.status(r.status).json(JSON.parse(text)); }
    catch { return res.status(r.status).send(text || ''); }

  } catch (err) {
    console.error('mcincloud-proxy error:', err);
    return res.status(500).json({ error: String(err?.message || err) });
  }
}
