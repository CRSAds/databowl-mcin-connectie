// /pages/api/mcincloud-status.js
// Ontvangt MCInCloud-callback en post status naar Databowl als x-www-form-urlencoded.
// Koppelt terug op specifieke lead met 'id=<leadId>' (uit additionalData.leadId of body.leadId).

export default async function handler(req, res) {
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const { timestamp, status, callId, additionalData } = body;

    const leadId =
      (additionalData && (additionalData.leadId ?? additionalData.leadID ?? additionalData.lead_id)) ??
      body.leadId ?? null;

    const statusValue = [
      status || 'unknown',
      callId ? `callId=${callId}` : null,
      timestamp || null
    ].filter(Boolean).join(' | ');

    const DATABOWL_URL = process.env.DATABOWL_URL || 'https://crsadvertising.databowl.com/api/v1/lead';
    const CID = process.env.DATABOWL_CID || '5314';
    const SID = process.env.DATABOWL_SID || '34';

    const formObj = {
      cid: String(CID),
      sid: String(SID),
      f_2608_Ai_Agent_Status: statusValue
    };
    if (leadId) {
      formObj.id = String(leadId); // update gericht op specifieke lead
    }

    const bodyStr = new URLSearchParams(formObj).toString();

    const headers = {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(bodyStr).toString(),
      'Host': 'crsadvertising.databowl.com'
    };

    const r = await fetch(DATABOWL_URL, { method: 'POST', headers, body: bodyStr });
    const respText = await r.text();

    // Debug logging
    const debug = (req.query && req.query.debug === '1') || process.env.DEBUG === '1';
    if (debug) {
      console.log('To Databowl:', bodyStr);
      console.log('Databowl status:', r.status, 'resp:', respText);
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('mcincloud-status error:', err);
    return res.status(200).json({ ok: false, error: String(err?.message || err) });
  }
}
