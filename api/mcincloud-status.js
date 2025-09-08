// /api/mcincloud-status.js
// MCInCloud callback → update status in Databowl.
// 1) Probeert Lead Update API met diverse key-varianten.
// 2) Fallback alleen met UID (voorkomt 'created').

async function postForm(url, form, host, debugLabel) {
  const bodyStr = new URLSearchParams(form).toString();
  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Content-Length': Buffer.byteLength(bodyStr).toString(),
    'Host': host
  };
  if (debugLabel) console.log(`${debugLabel} →`, url, bodyStr);
  const r = await fetch(url, { method: 'POST', headers, body: bodyStr });
  const txt = await r.text();
  if (debugLabel) console.log(`${debugLabel} resp:`, r.status, txt);
  return { r, txt };
}

export default async function handler(req, res) {
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const { timestamp, status, callId, additionalData } = body;

    const url = new URL(req.url, `https://${req.headers.host}`);
    const debug = url.searchParams.get('debug') === '1' || process.env.DEBUG === '1';

    // identifiers uit query of body
    const leadIdQ  = url.searchParams.get('leadId');
    const leadUidQ = url.searchParams.get('leadUid');
    const leadIdA  = additionalData && (additionalData.leadId  ?? additionalData.leadID  ?? additionalData.lead_id);
    const leadUidA = additionalData && (additionalData.leadUid ?? additionalData.leadUID ?? additionalData.lead_uid);
    const leadId   = (leadIdQ  ?? leadIdA  ?? body.leadId)  ? String(leadIdQ  ?? leadIdA  ?? body.leadId)  : null;
    const leadUid  = (leadUidQ ?? leadUidA ?? body.leadUid) ? String(leadUidQ ?? leadUidA ?? body.leadUid) : null;

    const statusValue = [ status || 'unknown', callId ? `callId=${callId}` : null, timestamp || null ]
      .filter(Boolean).join(' | ');

    const INSTANCE      = process.env.DATABOWL_INSTANCE || 'crsadvertising';
    const PRIVATE_KEY   = process.env.DATABOWL_API_KEY || '';      // jouw Private Key
    const PUBLIC_KEY    = process.env.DATABOWL_PUBLIC_KEY || '';   // optioneel, jouw Public Key
    const CID           = process.env.DATABOWL_CID || '5314';
    const SID           = process.env.DATABOWL_SID || '34';
    const host          = `${INSTANCE}.databowl.com`;

    // 1) UPDATE API (op basis van lead_id)
    if (leadId) {
      const updateUrl = `https://${host}/api/v1/lead-data/update/${encodeURIComponent(leadId)}`;

      // probeer verschillende key-varianten totdat het geen 'invalid_key' meer is
      const keyAttempts = [
        { param: 'key',     value: PRIVATE_KEY, label: 'UPDATE API (key=PRIVATE)' },
        { param: 'api_key', value: PRIVATE_KEY, label: 'UPDATE API (api_key=PRIVATE)' },
      ];
      if (PUBLIC_KEY) {
        keyAttempts.push(
          { param: 'key',     value: PUBLIC_KEY, label: 'UPDATE API (key=PUBLIC)' },
          { param: 'api_key', value: PUBLIC_KEY, label: 'UPDATE API (api_key=PUBLIC)' },
        );
      }

      for (const attempt of keyAttempts) {
        if (!attempt.value) continue;
        const form = {
          [attempt.param]: attempt.value,
          reprocess: 'false',
          validate: 'false',
          f_2608_Ai_Agent_Status: statusValue
        };
        const { r, txt } = await postForm(updateUrl, form, host, debug ? attempt.label : '');
        // Succes
        if (r.ok) return res.status(200).json({ ok: true, via: 'update-api', used: attempt.param });

        // Als de API expliciet 'invalid_key' teruggeeft, probeer de volgende variant
        if (/invalid_key/i.test(txt)) continue;

        // Andere fout → breek uit en ga naar fallback
        break;
      }
    }

    // 2) FALLBACK: alleen met UID (voorkomt 'created')
    if (leadUid) {
      const fbUrl  = `https://${host}/api/v1/lead`;
      const fbForm = {
        cid: String(CID),
        sid: String(SID),
        uid: leadUid, // <-- uitsluitend uid, geen id!
        f_2608_Ai_Agent_Status: statusValue
      };
      await postForm(fbUrl, fbForm, host, debug ? 'FALLBACK' : '');
      return res.status(200).json({ ok: true, via: 'fallback-uid' });
    }

    // Geen geldige update-mogelijkheid
    if (debug) console.log('Geen update uitgevoerd: ontbrekende/ongeldige key en geen uid aanwezig.');
    return res.status(200).json({ ok: false, reason: 'no-valid-update-path' });

  } catch (err) {
    console.error('mcincloud-status error:', err);
    return res.status(200).json({ ok: false, error: String(err?.message || err) });
  }
}
