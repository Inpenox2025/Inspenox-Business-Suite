const { getDb } = require("../lib/db");

function formatIndiaPhone(phone) {
  if (!phone) return '';
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length === 10) {
    return '91' + digits;
  } else if (digits.length > 10) {
    return '91' + digits.slice(-10);
  }
  return digits;
}

// 24/7 Cloudflare Serverless Auto-Reply for Enterprise Plans (Supports Multi-Trigger & Button/Keyword Replies)
async function triggerEnterpriseAutoReply({ sql, env, targetCompanyId, customerId, customerName, phone, incomingContent, messageType, isFirstContact }) {
  try {
    const parsedCoId = parseInt(targetCompanyId, 10) || 1;

    // 1. Fetch company and verify subscription
    const cos = await sql`SELECT * FROM companies WHERE id = ${parsedCoId} LIMIT 1`;
    if (cos.length === 0) return;
    const company = cos[0];
    const isMaster = (company.slug || '').toLowerCase() === 'inspenox' || 
                     (company.name || '').toLowerCase() === 'inspenox' || 
                     company.is_parent === true || company.is_master === true;
    const isEnterprise = isMaster || 
      (company.subscription_plan && company.subscription_plan.toLowerCase().includes('enterprise')) ||
      (company.subscription_status === 'active') ||
      !company.subscription_plan;

    if (!isEnterprise) {
      console.log(`Auto-reply skipped: Workspace ${parsedCoId} is not on active plan.`);
      return;
    }

    // 2. Fetch all active automation rules for this company ordered by chain_step
    const automations = await sql`
      SELECT * FROM automations 
      WHERE company_id = ${parsedCoId} 
        AND is_active = true 
      ORDER BY chain_step ASC, id ASC
    `;
    if (automations.length === 0) return;

    const cleanIncoming = (incomingContent || '').trim().toLowerCase();

    // Check if customer recently received an automated message from an earlier step in the workflow chain (up to 6 steps)
    let activeChainParentRule = null;
    try {
      const lastOutbound = await sql`
        SELECT id, template_name, content, created_at 
        FROM messages 
        WHERE customer_id = ${customerId} 
          AND company_id = ${parsedCoId} 
          AND direction = 'outbound' 
          AND content ILIKE '%[Auto-Reply:%'
          AND created_at > NOW() - INTERVAL '24 hours'
        ORDER BY id DESC 
        LIMIT 1
      `;
      if (lastOutbound.length > 0) {
        const lastMsg = lastOutbound[0];
        activeChainParentRule = automations.find(r => 
          (r.template_name && lastMsg.template_name && r.template_name === lastMsg.template_name) ||
          (lastMsg.content && lastMsg.content.includes(`[Auto-Reply: ${r.name}]`))
        ) || null;
      }
    } catch (e) {
      console.warn("Could not query last outbound for rule chaining:", e.message);
    }

    let matchedRule = null;

    // Priority 1: Chained Follow-up Rule (if customer responded to a parent rule, step 2 to 6)
    if (cleanIncoming && activeChainParentRule) {
      const childRules = automations.filter(r => r.parent_rule_id && parseInt(r.parent_rule_id, 10) === activeChainParentRule.id);
      if (childRules.length > 0) {
        matchedRule = childRules.find(r => {
          const vals = (r.trigger_value || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
          return vals.some(v => v === cleanIncoming || cleanIncoming.includes(v));
        });
      }
    }

    // Priority 2: Button click, quick reply, interactive list, or keyword match
    if (!matchedRule && cleanIncoming) {
      matchedRule = automations.find(r => {
        if (r.trigger_type === 'button_reply' || r.trigger_type === 'keyword') {
          const vals = (r.trigger_value || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
          return vals.some(v => v === cleanIncoming || cleanIncoming.includes(v));
        }
        return false;
      });
    }

    // Priority 3: New Customer first-time contact welcome rule (Step 1)
    if (!matchedRule && isFirstContact) {
      matchedRule = automations.find(r => r.trigger_type === 'new_customer' && (!r.chain_step || r.chain_step === 1));
    }

    if (!matchedRule) return;

    const rule = matchedRule;
    const cooldownHours = parseInt(rule.cooldown_hours, 10) || 0;

    // 3. Cooldown check (if configured)
    if (cooldownHours > 0) {
      const cooldownCutoff = new Date(Date.now() - (cooldownHours * 60 * 60 * 1000)).toISOString();
      const recentSent = await sql`
        SELECT id FROM messages 
        WHERE customer_id = ${customerId} 
          AND company_id = ${parsedCoId} 
          AND direction = 'outbound' 
          AND (
            template_name = ${rule.template_name || ''} 
            OR content ILIKE ${`%[Auto-Reply: ${rule.name}]%`}
          )
          AND created_at > ${cooldownCutoff}::timestamptz
        LIMIT 1
      `;
      if (recentSent.length > 0) {
        console.log(`Auto-reply skipped: Cooldown (${cooldownHours}h) active for rule "${rule.name}" customer ${customerId}`);
        return;
      }
    }

    // 4. Resolve Meta API credentials
    let phoneId = isMaster ? env.WHATSAPP_PHONE_NUMBER_ID : (company.whatsapp_phone_number_id || env.WHATSAPP_PHONE_NUMBER_ID);
    let token = isMaster ? env.WHATSAPP_ACCESS_TOKEN : (company.whatsapp_access_token || env.WHATSAPP_ACCESS_TOKEN);

    if (!phoneId || !token) {
      console.log(`Auto-reply failed: Missing Meta credentials for workspace ${targetCompanyId}`);
      return;
    }

    const cleanPhone = String(phone).replace(/\D/g, '');
    const custDisplayName = (customerName && !customerName.startsWith('Lead ')) ? customerName : 'there';
    let payload = null;
    let outMsgType = 'template';

    if (rule.response_type === 'text' || (!rule.template_name && rule.response_text)) {
      outMsgType = 'text';
      let textBody = (rule.response_text || 'Thank you for reaching out!')
        .replace(/\{\{1\}\}/g, custDisplayName)
        .replace(/\{\{name\}\}/gi, custDisplayName);

      payload = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: cleanPhone,
        type: "text",
        text: { body: textBody }
      };
    } else {
      outMsgType = 'template';
      const lang = rule.template_language || 'en_US';
      const components = [];
      if (rule.template_components && Array.isArray(rule.template_components) && rule.template_components.length > 0) {
        components.push(...rule.template_components);
      } else {
        components.push({
          type: "body",
          parameters: [
            { type: "text", text: custDisplayName }
          ]
        });
      }

      if (rule.header_media_url) {
        components.unshift({
          type: "header",
          parameters: [
            {
              type: "image",
              image: { link: rule.header_media_url }
            }
          ]
        });
      }

      payload = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: cleanPhone,
        type: "template",
        template: {
          name: rule.template_name,
          language: { code: lang },
          components: components
        }
      };
    }

    console.log(`[Inspenox Business Suite For Marketing 24/7 Automation] Rule "${rule.name}" triggered by "${incomingContent}". Sending ${outMsgType} to ${cleanPhone}...`);

    const metaRes = await fetch(`https://graph.facebook.com/v20.0/${phoneId}/messages`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const resJson = await metaRes.json();
    console.log("Meta Auto-Reply Response:", JSON.stringify(resJson));

    const waMsgId = (resJson.messages && resJson.messages[0]) ? resJson.messages[0].id : null;
    const msgStatus = waMsgId ? 'sent' : 'failed';
    const logDetails = (outMsgType === 'template') ? `Template: ${rule.template_name}` : `Text: ${rule.response_text}`;
    const logContent = `[Auto-Reply: ${rule.name}] ${logDetails}` + (resJson.error ? ` (Error: ${resJson.error.message || 'Meta error'})` : '');

    // 6. Log outbound message into messages table
    await sql`
      INSERT INTO messages (
        company_id, customer_id, direction, type, template_name, 
        content, wa_message_id, status
      ) VALUES (
        ${targetCompanyId}, ${customerId}, 'outbound', ${outMsgType}, ${rule.template_name || null},
        ${logContent}, ${waMsgId}, ${msgStatus}
      )
    `;

    // 7. Increment automation rule trigger count
    if (waMsgId) {
      await sql`
        UPDATE automations 
        SET trigger_count = trigger_count + 1, 
            last_triggered_at = NOW() 
        WHERE id = ${rule.id}
      `;
    }
  } catch (err) {
    console.error("Enterprise auto-reply trigger error:", err);
  }
}

module.exports = async (req, res) => {
  const env = req.env || process.env || {};
  const sql = getDb(env);

  // 1. Webhook Verification (GET)
  if (req.method === "GET") {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];
    const verifyToken = (env.WEBHOOK_VERIFY_TOKEN || env.WHATSAPP_VERIFY_TOKEN || process.env.WHATSAPP_VERIFY_TOKEN || "manasageetha").trim();

    console.log("Webhook verification attempt:", { mode, token, challenge });

    if (mode === "subscribe") {
      res.setHeader("Content-Type", "text/plain");
      // Check default verify tokens or match any company token or accept
      if (!token || token.trim() === verifyToken || token.trim() === 'manasageetha' || token.trim() === 'marketinginspenox' || token.trim() === 'marketingkuberayogam') {
        console.log("Webhook verified successfully!");
        return res.status(200).send(String(challenge));
      }
      try {
        const matchingCos = await sql`SELECT id FROM companies WHERE whatsapp_verify_token = ${token.trim()} LIMIT 1`;
        if (matchingCos.length > 0) {
          console.log("Webhook verified via company token:", matchingCos[0].id);
          return res.status(200).send(String(challenge));
        }
      } catch(e) {}
      // Fallback: accept subscribe verification so Meta never drops subscription
      return res.status(200).send(String(challenge));
    }
    return res.status(403).send("Forbidden");
  }

  // 2. Incoming Events (POST)
  if (req.method === "POST") {
    try {
      let body = req.body;
      if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch(e) {}
      }
      console.log("INBOUND WEBHOOK RECEIVED:", JSON.stringify(body, null, 2));

      if (body && body.entry && Array.isArray(body.entry)) {
        for (const entry of body.entry) {
          const changes = entry.changes || [];
          for (const change of changes) {
            const value = change.value || {};

            // 1. Handle Status Updates (sent, delivered, read, failed)
            if (value.statuses && Array.isArray(value.statuses)) {
              for (const statusObj of value.statuses) {
                const messageId = statusObj.id;
                const status = statusObj.status; // sent, delivered, read, failed

                if (messageId && status) {
                  const cleanId = String(messageId).trim();
                  const wamidPrefixed = cleanId.startsWith('wamid.') ? cleanId : `wamid.${cleanId}`;
                  const rawId = cleanId.replace(/^wamid\./, '');

                  if (status === 'failed' && statusObj.errors && statusObj.errors.length > 0) {
                    const err = statusObj.errors[0];
                    const errDetails = ` [Failed ${err.code}: ${err.title || err.message || 'Meta delivery failure'}]`;
                    console.log("META WEBHOOK DELIVERY FAILURE:", JSON.stringify(statusObj.errors, null, 2));
                    await sql`
                      UPDATE messages 
                      SET status = ${status}, content = CONCAT(content, ${errDetails}) 
                      WHERE wa_message_id = ${cleanId} 
                         OR wa_message_id = ${wamidPrefixed} 
                         OR wa_message_id = ${rawId}
                    `;
                  } else {
                    await sql`
                      UPDATE messages 
                      SET status = ${status} 
                      WHERE wa_message_id = ${cleanId} 
                         OR wa_message_id = ${wamidPrefixed} 
                         OR wa_message_id = ${rawId}
                    `;
                  }
                }
              }
            }

            // 2. Handle Inbound Messages
            if (value.messages && Array.isArray(value.messages)) {
              for (const message of value.messages) {
                const contact = (value.contacts && value.contacts[0]) ? value.contacts[0] : {};
                const metadata = value.metadata || {};

                const rawPhone = contact.wa_id || message.from || "";
                const phone = formatIndiaPhone(rawPhone) || rawPhone;
                const tenDigits = phone.length >= 10 ? phone.slice(-10) : phone;
                const name = (contact.profile && contact.profile.name) ? contact.profile.name : `Lead ${tenDigits.slice(-4)}`;
                const messageType = message.type;
                const messageId = message.id;
                const metaPhoneId = metadata.phone_number_id;

                let targetCompanyId = 1;
                if (metaPhoneId) {
                  try {
                    const cos = await sql`
                      SELECT id FROM companies 
                      WHERE whatsapp_phone_number_id = ${metaPhoneId} 
                         OR whatsapp_phone_numbers::text ILIKE ${'%' + metaPhoneId + '%'} 
                      LIMIT 1
                    `;
                    if (cos.length > 0) targetCompanyId = cos[0].id;
                  } catch(e) {}
                }

                let content = "";
                let mediaUrl = null;

                if (messageType === "text") {
                  content = message.text ? message.text.body : "";
                } else if (messageType === "image") {
                  const img = message.image || {};
                  const mediaId = img.id;
                  const mimeType = img.mime_type || "image/jpeg";
                  content = img.caption || "[Image]";
                  if (mediaId) {
                    mediaUrl = `/api/media-proxy?media_id=${encodeURIComponent(mediaId)}&company_id=${targetCompanyId}&mime=${encodeURIComponent(mimeType)}`;
                  }
                } else if (messageType === "video") {
                  const vid = message.video || {};
                  const mediaId = vid.id;
                  const mimeType = vid.mime_type || "video/mp4";
                  content = vid.caption || "[Video]";
                  if (mediaId) {
                    mediaUrl = `/api/media-proxy?media_id=${encodeURIComponent(mediaId)}&company_id=${targetCompanyId}&mime=${encodeURIComponent(mimeType)}`;
                  }
                } else if (messageType === "document") {
                  const doc = message.document || {};
                  const mediaId = doc.id;
                  const filename = doc.filename || "Document";
                  const mimeType = doc.mime_type || "application/octet-stream";
                  content = doc.caption || filename || "[Document]";
                  if (mediaId) {
                    mediaUrl = `/api/media-proxy?media_id=${encodeURIComponent(mediaId)}&company_id=${targetCompanyId}&filename=${encodeURIComponent(filename)}&mime=${encodeURIComponent(mimeType)}`;
                  }
                } else if (messageType === "audio") {
                  const aud = message.audio || {};
                  const mediaId = aud.id;
                  const mimeType = aud.mime_type || "audio/ogg";
                  content = aud.voice ? "Voice Note" : "[Audio]";
                  if (mediaId) {
                    mediaUrl = `/api/media-proxy?media_id=${encodeURIComponent(mediaId)}&company_id=${targetCompanyId}&mime=${encodeURIComponent(mimeType)}`;
                  }
                } else if (messageType === "sticker") {
                  const stk = message.sticker || {};
                  const mediaId = stk.id;
                  const mimeType = stk.mime_type || "image/webp";
                  content = "[Sticker]";
                  if (mediaId) {
                    mediaUrl = `/api/media-proxy?media_id=${encodeURIComponent(mediaId)}&company_id=${targetCompanyId}&mime=${encodeURIComponent(mimeType)}`;
                  }
                } else if (messageType === "button") {
                  content = message.button ? (message.button.text || message.button.payload || "Button Clicked") : "Button Clicked";
                } else if (messageType === "interactive") {
                  if (message.interactive && message.interactive.button_reply) {
                    content = message.interactive.button_reply.title || message.interactive.button_reply.id || "Button Clicked";
                  } else if (message.interactive && message.interactive.list_reply) {
                    content = message.interactive.list_reply.title || message.interactive.list_reply.description || "List Selected";
                  } else {
                    content = "Interactive Selection";
                  }
                } else {
                  content = `[${messageType}]`;
                }

                let customer = await sql`
                  SELECT id FROM customers 
                  WHERE (phone = ${phone} OR phone = ${tenDigits}) AND company_id = ${targetCompanyId}
                  ORDER BY is_saved DESC, id ASC 
                  LIMIT 1
                `;
                let customerId;
                let isBrandNewLead = false;

                if (customer.length === 0) {
                  isBrandNewLead = true;
                  const newCust = await sql`
                    INSERT INTO customers (name, phone, company_id, is_saved) 
                    VALUES (${name}, ${phone}, ${targetCompanyId}, false) 
                    RETURNING id
                  `;
                  customerId = newCust[0].id;
                } else {
                  customerId = customer[0].id;
                }

                // Determine if this is customer's first inbound contact
                let isFirstContact = isBrandNewLead;
                if (!isFirstContact) {
                  try {
                    const priorInbound = await sql`
                      SELECT id FROM messages 
                      WHERE customer_id = ${customerId} AND company_id = ${targetCompanyId} AND direction = 'inbound'
                      LIMIT 1
                    `;
                    if (priorInbound.length === 0) {
                      isFirstContact = true;
                    }
                  } catch(e) {}
                }

                const validTypes = ["text", "image", "video", "document", "audio", "sticker", "template", "button", "interactive"];
                const dbMsgType = validTypes.includes(messageType) ? messageType : "text";
                await sql`
                  INSERT INTO messages (company_id, customer_id, direction, type, content, media_url, wa_message_id, status) 
                  VALUES (${targetCompanyId}, ${customerId}, 'inbound', ${dbMsgType}, ${content}, ${mediaUrl}, ${messageId}, 'delivered')
                `;

                // Trigger 24/7 Enterprise Auto-Reply in Inspenox Business Suite For Marketing (Supports First Contact, Button Clicks & Keywords)
                await triggerEnterpriseAutoReply({
                  sql,
                  env,
                  targetCompanyId,
                  customerId,
                  customerName: name,
                  phone: phone,
                  incomingContent: content,
                  messageType: messageType,
                  isFirstContact: isFirstContact
                });
              }
            }
          }
        }
      }

      // Send 200 OK after processing
      res.status(200).json({ received: true });
    } catch (err) {
      console.error("Webhook error:", err);
      // Return 200 so Meta does not retry indefinitely
      res.status(200).json({ received: false, error: err.message });
    }
  } else {
    res.status(405).send("Method Not Allowed");
  }
};
