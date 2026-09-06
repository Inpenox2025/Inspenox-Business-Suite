const { getDb } = require("../lib/db");

module.exports = async (req, res) => {
  const env = req.env || process.env || {};
  const sql = getDb(env);

  // 1. Webhook Verification (GET)
  if (req.method === "GET") {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];
    const verifyToken = env.WEBHOOK_VERIFY_TOKEN || env.WHATSAPP_VERIFY_TOKEN;

    if (mode === "subscribe") {
      if (token === verifyToken) {
        return res.status(200).send(challenge);
      }
      try {
        const matchingCos = await sql`SELECT id FROM companies WHERE webhook_verify_token = ${token} LIMIT 1`;
        if (matchingCos.length > 0) {
          return res.status(200).send(challenge);
        }
      } catch(e) {}
    }
    return res.status(403).send("Forbidden");
  }

  // 2. Incoming Events (POST)
  if (req.method === "POST") {
    try {
      const body = req.body;
      console.log("INBOUND WEBHOOK RECEIVED:", JSON.stringify(body, null, 2));

      if (body.object) {
        if (
          body.entry &&
          body.entry[0].changes &&
          body.entry[0].changes[0].value.messages
        ) {
          const value = body.entry[0].changes[0].value;
          const message = value.messages[0];
          const contact = value.contacts[0];
          const metadata = value.metadata || {};

          const phone = contact.wa_id;
          const name = contact.profile.name;
          const messageType = message.type;
          const messageId = message.id;
          const metaPhoneId = metadata.phone_number_id;

          // Lookup matching company by phone_number_id
          let targetCompanyId = 1;
          if (metaPhoneId) {
            try {
              const cos = await sql`SELECT id FROM companies WHERE whatsapp_phone_number_id = ${metaPhoneId} LIMIT 1`;
              if (cos.length > 0) targetCompanyId = cos[0].id;
            } catch(e) {}
          }

          let content = "";
          if (messageType === "text") {
            content = message.text ? message.text.body : "";
          } else if (messageType === "image") {
            content = message.image ? (message.image.caption || "[Image]") : "[Image]";
          } else if (messageType === "video") {
            content = message.video ? (message.video.caption || "[Video]") : "[Video]";
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

          // Ensure customer exists or create them
          let customer = await sql`SELECT id FROM customers WHERE phone = ${phone}`;
          let customerId;

          if (customer.length === 0) {
            const newCust = await sql`
              INSERT INTO customers (name, phone, company_id, is_saved) 
              VALUES (${name}, ${phone}, ${targetCompanyId}, false) 
              RETURNING id
            `;
            customerId = newCust[0].id;
          } else {
            customerId = customer[0].id;
          }

          // Insert inbound message
          const dbMsgType = (messageType === "text" || messageType === "image" || messageType === "video" || messageType === "template" || messageType === "button" || messageType === "interactive") ? messageType : "text";
          await sql`
            INSERT INTO messages (company_id, customer_id, direction, type, content, wa_message_id, status) 
            VALUES (${targetCompanyId}, ${customerId}, 'inbound', ${dbMsgType}, ${content}, ${messageId}, 'delivered')
          `;
        } else if (
          body.entry &&
          body.entry[0].changes &&
          body.entry[0].changes[0].value.statuses
        ) {
          const statusObj = body.entry[0].changes[0].value.statuses[0];
          const messageId = statusObj.id;
          const status = statusObj.status; // sent, delivered, read, failed

          if (status === 'failed' && statusObj.errors && statusObj.errors.length > 0) {
              const err = statusObj.errors[0];
              const errDetails = ` [Failed ${err.code}: ${err.title || err.message || 'Meta delivery failure'}]`;
              console.log("META WEBHOOK DELIVERY FAILURE:", JSON.stringify(statusObj.errors, null, 2));
              await sql`UPDATE messages SET status = ${status}, content = CONCAT(content, ${errDetails}) WHERE wa_message_id = ${messageId}`;
          } else {
              await sql`UPDATE messages SET status = ${status} WHERE wa_message_id = ${messageId}`;
          }
        }
      }

      res.status(200).json({ received: true });
    } catch (err) {
      console.error("Webhook error:", err);
      res.status(200).json({ received: false, error: err.message });
    }
  } else {
    res.status(405).json({ error: "Method Not Allowed" });
  }
};
