// /api/mcincloud-status.js
// Ontvangt MCInCloud callback en werkt status bij in Databowl.
// Primair: Lead Update API op basis van lead_id (ID) + key
// Fallback: oud pad met uid als we geen ID hebben.

export default async function handler(req, res) {
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const { timestamp, status, callId, additionalData } = body;

    // identifiers uit query of body
    const url = new URL(req.url, `https://${req.headers.host}`);
    const leadIdFromQuery  = url.searchParams.get('leadId');  // numerieke ID
    const leadUidFromQuery = url.searchParams.get('leadUid'); // UID
    const leadIdFromAdd =
      additionalData && (additionalData.leadId ?? additionalData.leadID ?? additionalData.lead_id);
    const leadUidFromAdd =
      additionalData && (additionalData.leadUid ?? additionalData.leadUID ?? additionalData.lead_uid);

    // kies beste bronnen
    const leadId  = (leadIdFromQuery  ?? leadIdFromAdd  ?? body.leadId)  ? String(leadIdFromQuery  ?? leadIdFromAdd  ?? body.leadId)  : null;
    const leadUid = (leadUidFromQuery ?? leadUidFromAdd ?? body.leadUid) ? String(leadUidFromQuery ?? leadUidFromAdd ?? body.leadUid) : null;

    // bouw status-waarde
    const statusValue = [ status || 'unknown', callId ? `callId=${callId}` : null, timestamp || null ]
      .filter(Boolean).join(' | ');

    // env config
    const INSTANCE = process.env.DATABOWL_INSTANCE || 'crsadvertising'; // ← zet dit in Vercel
    const API_KEY  = process.env.DATABOWL_API_KEY;                      // ← zet jouw API key
    const CID      = process.env.DATABOWL_CID || '5314';
    const SID      = process.env.DATABOWL_SID || '34';

    // debug toggle
    const debug = url.searchParams.get('debug') === '1' || process.env.DEBUG === '1';

    // 1) PROBEER Lead Update API met lead_id (ID)
    if (API_KEY && leadId) {
      const updateUrl = `https://${INSTANCE}.databowl.com/api/v1/lead-data/update/${encodeURIComponent(leadId)}`;
      const formObj = {
        key: API_KEY,
        reprocess: 'false',
        validate: 'false',
        f_2608_Ai_Agent_Status: statusValue
      };
      const bodyStr = new URLSearchParams(formObj).toString();
      const headers = {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(bodyStr).toString(),
        'Host': `${INSTANCE}.databowl.com`
      };

      if (debug) console.log('UPDATE API →', updateUrl, bodyStr);
      const r = await fetch(updateUrl, { method: 'POST', headers, body: bodyStr });
      const txt = await r.text();
      if (debug) console.log('UPDATE API resp:', r.status, txt);

      // Succes? dan klaar
      if (r.ok) return res.status(200).json({ ok: true, via: 'update-api' });
    }

    // 2) FALLBACK: klassiek endpoint met uid (werkt in jouw flow)
    const postUrl = `https://${INSTANCE}.databowl.com/api/v1/lead`;
    const fbForm = {
      cid: String(CID),
      sid: String(SID),
      ...(leadUid ? { uid: leadUid } : {}),                    // probeer met UID
      ...(leadId  ? { id: leadId }  : {}),                     // backstop: ID meegeven ook hier
      f_2608_Ai_Agent_Status: statusValue
    };
    const fbStr = new URLSearchParams(fbForm).toString();
    const fbHeaders = {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(fbStr).toString(),
      'Host': `${INSTANCE}.databowl.com`
    };

    if (debug) console.log('FALLBACK →', postUrl, fbStr);
    const fr = await fetch(postUrl, { method: 'POST', headers: fbHeaders, body: fbStr });
    const ftxt = await fr.text();
    if (debug) console.log('FALLBACK resp:', fr.status, ftxt);

    return res.status(200).json({ ok: true, via: 'fallback' });

  } catch (err) {
    console.error('mcincloud-status error:', err);
    return res.status(200).json({ ok: false, error: String(err?.message || err) });
  }
}
