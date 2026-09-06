const { getDb } = require("../lib/db");

module.exports = async (req, res) => {
  // 1. Webhook Verification (GET)
  if (req.method === "GET") {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
      return res.status(200).send(challenge);
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
          const message = body.entry[0].changes[0].value.messages[0];
          const contact = body.entry[0].changes[0].value.contacts[0];

          const phone = contact.wa_id;
          const name = contact.profile.name;
          const messageType = message.type;
          const messageId = message.id;

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

          const sql = getDb();

          // Ensure customer exists or create them
          let customer =
            await sql`SELECT id FROM customers WHERE phone = ${phone}`;
          let customerId;

          if (customer.length === 0) {
            const newCust =
              await sql`INSERT INTO customers (name, phone, is_saved) VALUES (${name}, ${phone}, false) RETURNING id`;
            customerId = newCust[0].id;
          } else {
            customerId = customer[0].id;
          }

          // Insert inbound message
          const dbMsgType = (messageType === "text" || messageType === "image" || messageType === "video" || messageType === "template" || messageType === "button" || messageType === "interactive") ? messageType : "text";
          await sql`INSERT INTO messages (customer_id, direction, type, content, wa_message_id, status) 
                              VALUES (${customerId}, 'inbound', ${dbMsgType}, ${content}, ${messageId}, 'delivered')`;
        } else if (
          body.entry &&
          body.entry[0].changes &&
          body.entry[0].changes[0].value.statuses
        ) {
          const statusObj = body.entry[0].changes[0].value.statuses[0];
          const messageId = statusObj.id;
          const status = statusObj.status; // sent, delivered, read, failed

          const sql = getDb();
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

      // Send 200 OK after processing so Vercel doesn't freeze the function
      res.status(200).json({ received: true });
    } catch (err) {
      console.error("Webhook error:", err);
      // Even on error, we should return 200 to prevent Meta from retrying infinitely
      res.status(200).json({ received: false, error: err.message });
    }
  } else {
    res.status(405).send("Method Not Allowed");
  }
};
