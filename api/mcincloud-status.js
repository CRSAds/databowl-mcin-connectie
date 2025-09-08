// /pages/api/mcincloud-status.js
// Ontvangt status-callback van MCInCloud en pusht deze naar Databowl (x-www-form-urlencoded)
// Schrijft naar specifieke lead via 'id=<leadId>' + f_2608_Ai_Agent_Status

export default async function handler(req, res) {
  try {
    // Body is JSON: { timestamp, status, callId, additionalData: { leadId?, ... } }
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const { timestamp, status, callId, additionalData } = body;

    // Haal leadId uit additionalData (of fallback naar root leadId als die ooit wordt meegestuurd)
    const leadId =
      (additionalData && (additionalData.leadId ?? additionalData.leadID ?? additionalData.lead_id)) ??
      body.leadId ??
      null;

    // Bouw status-string (of pas aan naar JSON-string als je wil)
    const statusValue = [
      status || 'unknown',
      callId ? `callId=${callId}` : null,
      timestamp || null
    ].filter(Boolean).join(' | ');

    // Databowl config
    const DATABOWL_URL = process.env.DATABOWL_URL || 'https://crsadvertising.databowl.com/api/v1/lead';
    const CID = process.env.DATABOWL_CID || '5314';
    const SID = process.env.DATABOWL_SID || '34';

    // Form payload voor Databowl (x-www-form-urlencoded)
    const formObj = {
      cid: String(CID),
      sid: String(SID),
      f_2608_Ai_Agent_Status: statusValue
    };

    // Koppel terug op specifieke lead:
    // Veel Databowl-configs accepteren 'id' om een bestaande lead te updaten.
    // Als jouw omgeving een andere sleutel vereist (bv. 'lead_id'), wijzig dit hier:
    if (leadId) {
      formObj.id = String(leadId); // <<< update specifiek lead record
    }

    const bodyStr = new URLSearchParams(formObj).toString();

    // Verplichte headers voor Databowl
    const headers = {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(bodyStr).toString(),
      'Host': 'crsadvertising.databowl.com'
    };

    const r = await fetch(DATABOWL_URL, {
      method: 'POST',
      headers,
      body: bodyStr
    });

    const respText = await r.text();
    try { console.log('Databowl response JSON:', JSON.parse(respText)); }
    catch { console.log('Databowl response TEXT:', respText); }

    // Antwoord 200 aan MCInCloud zodat zij niet blijven retried’en
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('mcincloud-status error:', err);
    // Nog steeds 200 teruggeven om retries te voorkomen; log wel de fout.
    return res.status(200).json({ ok: false, error: String(err?.message || err) });
  }
}
