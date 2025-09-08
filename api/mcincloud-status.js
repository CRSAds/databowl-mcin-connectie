// /api/mcincloud-status.js
export default async function handler(req, res) {
  try {
    const rawCT = req.headers['content-type'] || '';
    const body = typeof req.body === 'string'
      ? JSON.parse(req.body || '{}')
      : (req.body || {});
    const { timestamp, status, callId, additionalData } = body;

    // leadId terughalen
    const leadId =
      (additionalData && (additionalData.leadId ?? additionalData.leadID ?? additionalData.lead_id)) ??
      body.leadId ?? null;

    const statusValue = [ status || 'unknown', callId ? `callId=${callId}` : null, timestamp || null ]
      .filter(Boolean).join(' | ');

    const DATABOWL_URL = process.env.DATABOWL_URL || 'https://crsadvertising.databowl.com/api/v1/lead';
    const CID = process.env.DATABOWL_CID || '5314';
    const SID = process.env.DATABOWL_SID || '34';

    const formObj = {
      cid: String(CID),
      sid: String(SID),
      f_2608_Ai_Agent_Status: statusValue
    };
    if (leadId) formObj.id = String(leadId); // update specifiek lead

    const bodyStr = new URLSearchParams(formObj).toString();

    // Verplichte headers voor Databowl
    const headers = {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(bodyStr).toString(),
      'Host': 'crsadvertising.databowl.com'
    };

    const r = await fetch(DATABOWL_URL, { method: 'POST', headers, body: bodyStr });
    const respText = await r.text();

    const url = new URL(req.url, `https://${req.headers.host}`);
    const debug = url.searchParams.get('debug') === '1' || process.env.DEBUG === '1';
    if (debug) {
      console.log('STATUS → Databowl form:', bodyStr);
      console.log('Databowl resp:', r.status, respText);
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('mcincloud-status error:', err);
    return res.status(200).json({ ok: false, error: String(err?.message || err) });
  }
}
