// /api/mcincloud-status.js
export default async function handler(req, res) {
  try {
    // MCInCloud stuurt JSON: { timestamp, status, callId, additionalData }
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const { timestamp, status, callId, additionalData } = body;

    // Bouw een duidelijke status-string (pas aan naar smaak)
    // vb: "in-progress | callId=68ba... | 2025-09-05T07:27:07.082Z"
    const statusValue = [
      status || 'unknown',
      callId ? `callId=${callId}` : null,
      timestamp || null
    ].filter(Boolean).join(' | ');

    // Databowl target + keys
    const DATABOWL_URL = process.env.DATABOWL_URL || 'https://crsadvertising.databowl.com/api/v1/lead';
    const CID = process.env.DATABOWL_CID || '5314';
    const SID = process.env.DATABOWL_SID || '34';

    // Form body samenstellen (application/x-www-form-urlencoded)
    const formObj = {
      cid: CID,
      sid: SID,
      f_2608_Ai_Agent_Status: statusValue
    };

    // Als je meer velden wilt meesturen, kun je die hier mappen, bv:
    // if (additionalData && additionalData.leadId) formObj.f_2609_Ai_Agent_LeadId = String(additionalData.leadId);

    const form = new URLSearchParams(formObj);
    const bodyStr = form.toString();

    // Vereiste headers: Content-Type, Content-Length, Host
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
    // Log voor debug (optioneel)
    try { console.log('Databowl response JSON:', JSON.parse(respText)); }
    catch { console.log('Databowl response TEXT:', respText); }

    // Antwoord 200 aan MCInCloud (zodat hun retry-mechanisme niet onnodig doorgaat)
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('mcincloud-status error:', err);
    // Geef alsnog 200 terug; log de fout (MCInCloud blijft anders retried’en)
    return res.status(200).json({ ok: false, error: String(err?.message || err) });
  }
}
