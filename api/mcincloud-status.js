// /api/mcincloud-status.js
// Ontvangt MCInCloud callback en post status naar Databowl (x-www-form-urlencoded)
// Stuurt zowel uid als id mee (voor compat), en logt bij debug wat er naar Databowl gaat.

export default async function handler(req, res) {
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const { timestamp, status, callId, additionalData } = body;

    // leadId preferential order: ?leadId=... > additionalData.leadId > body.leadId
    const url = new URL(req.url, `https://${req.headers.host}`);
    const leadIdFromQuery = url.searchParams.get('leadId');
    const leadIdFromAdd =
      additionalData && (additionalData.leadId ?? additionalData.leadID ?? additionalData.lead_id);
    const leadId = (leadIdFromQuery || leadIdFromAdd || body.leadId) ? String(leadIdFromQuery || leadIdFromAdd || body.leadId) : null;

    // Build status value
    const statusValue = [ status || 'unknown', callId ? `callId=${callId}` : null, timestamp || null ]
      .filter(Boolean).join(' | ');

    // Databowl config
    const DATABOWL_URL = process.env.DATABOWL_URL || 'https://crsadvertising.databowl.com/api/v1/lead';
    const CID = process.env.DATABOWL_CID || '5314';
    const SID = process.env.DATABOWL_SID || '34';

    // Build form (send both uid and id if we have a leadId)
    const formObj = {
      cid: String(CID),
      sid: String(SID),
      f_2608_Ai_Agent_Status: statusValue
    };
    if (leadId) {
      formObj.uid = String(leadId); // veel setups verwachten uid
      formObj.id  = String(leadId); // sommige accepteren id i.p.v. uid
    }

    const bodyStr = new URLSearchParams(formObj).toString();

    // Required headers per Databowl
    const headers = {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(bodyStr).toString(),
      'Host': 'crsadvertising.databowl.com'
    };

    // Debug logging toggle
    const debug = url.searchParams.get('debug') === '1' || process.env.DEBUG === '1';
    if (debug) {
      console.log('STATUS payload to Databowl:', bodyStr);
    }

    const r = await fetch(DATABOWL_URL, { method: 'POST', headers, body: bodyStr });
    const respText = await r.text();

    if (debug) {
      console.log('Databowl resp:', r.status, respText);
    }

    // Bevestig altijd 200 aan MCInCloud (voorkomt retries)
    return res.status(200).json({ ok: true });

  } catch (err) {
    console.error('mcincloud-status error:', err);
    return res.status(200).json({ ok: false, error: String(err?.message || err) });
  }
}
