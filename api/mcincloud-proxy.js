// /api/mcincloud-proxy.js
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    // Tolerant body parsing (JSON of x-www-form-urlencoded)
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
      additionalData,
      leadId,
      ...rest
    } = body;

    // 1) Telefoon normaliseren → E.164 (NL default)
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

    // 2) Callback & method
    const host = req.headers.host;
    const fallbackCb = `https://${host}/api/mcincloud-status`;
    const cbUrl = (statusCallbackUrl || process.env.MCINCLOUD_STATUS_CALLBACK_URL || fallbackCb);
    const cbMethod = (statusCallbackMethod || 'POST').toUpperCase();

    // 3) additionalData → object of null; leadId altijd als string
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
      addData.leadId = String(leadId); // <-- forceer string
    }

    // 4) Validaties
    if (!phone || !phone.startsWith('+')) {
      return res.status(400).json({ error: 'customerPhoneNumber ontbreekt of is ongeldig (E.164 met +).' });
    }
    if (!/^https?:\/\//i.test(cbUrl)) {
      return res.status(400).json({ error: 'statusCallbackUrl moet een absolute http(s) URL zijn.' });
    }

    // 5) Definitieve payload: ALTIJD callDetails-schema
    const outbound = {
      callDetails: { customerPhoneNumber: phone },
      statusCallbackUrl: cbUrl,
      statusCallbackMethod: cbMethod,
      ...(addData === null ? {} : { additionalData: addData })
    };

    // --- Debug / Dry-run helpers ---
    const url = new URL(req.url, `https://${host}`);
    const debug = url.searchParams.get('debug') === '1' || process.env.DEBUG === '1';
    const dry = url.searchParams.get('dry') === '1';

    if (debug) {
      console.log('PROXY outbound → MCInCloud:', JSON.stringify(outbound));
    }
    if (dry) {
      return res.status(200).json({ ok: true, mode: 'dry-run', outbound });
    }
    // -------------------------------

    // 6) Doorposten naar MCInCloud
    const r = await fetch('https://api.dev.mcincloud.com/api/v2/calls/enriched', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(outbound)
    });

    const text = await r.text();
    try { return res.status(r.status).json(JSON.parse(text)); }
    catch { return res.status(r.status).send(text || ''); }

  } catch (err) {
    return res.status(500).json({ error: String(err?.message || err) });
  }
}
