const DEFAULT_GMAIL_USER = 'inspenox@gmail.com';
const DEFAULT_GMAIL_APP_PASS = 'ltbdphavwduyubxv';

function getCredentials(env = {}) {
    const user = env.GMAIL_USER || (typeof process !== 'undefined' && process.env && process.env.GMAIL_USER) || DEFAULT_GMAIL_USER;
    const pass = env.GMAIL_APP_PASSWORD || env.GMAIL_APP_CODE || (typeof process !== 'undefined' && process.env && (process.env.GMAIL_APP_PASSWORD || process.env.GMAIL_APP_CODE)) || DEFAULT_GMAIL_APP_PASS;

    return {
        user: String(user || '').trim(),
        pass: String(pass || '').replace(/\s+/g, '')
    };
}

/**
 * Creates a Gmail SMTP transporter with credentials from environment variables (for Node.js runtime).
 */
function getTransporter(env = {}) {
    const creds = getCredentials(env);
    if (!creds.user || !creds.pass) {
        return null;
    }

    try {
        const nodemailer = require('nodemailer');
        return nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: creds.user,
                pass: creds.pass
            }
        });
    } catch(e) {
        return null;
    }
}

/**
 * Generates and sends a rich HTML subscription invoice/receipt email.
 * Supports both Cloudflare Workers runtime (via worker-mailer and cloudflare:sockets)
 * and standard Node.js runtime (via nodemailer).
 */
async function sendSubscriptionReceiptEmail(options = {}) {
    const {
        to,
        phone,
        plan_name,
        original_amount,
        discount_amount,
        final_amount,
        coupon_code,
        order_id,
        payment_id,
        billing_cycle,
        valid_until,
        convenience_fee,
        env = {}
    } = options;

    if (!to || !to.includes('@')) {
        console.warn('Skipping email receipt: Invalid or missing recipient email:', to);
        return { success: false, error: 'Invalid recipient email' };
    }

    const creds = getCredentials(env);
    if (!creds.user || !creds.pass) {
        console.warn('Gmail credentials (GMAIL_USER & GMAIL_APP_PASSWORD) not found. Email receipt skipped.');
        return { 
            success: false, 
            warning: 'Gmail App Code not configured.' 
        };
    }

    const senderEmail = creds.user;
    const cycle = String(billing_cycle || options.billing_cycle || '').toLowerCase();
    const isAnnual = cycle.includes('annual') || cycle.includes('year') || String(plan_name || '').toLowerCase().includes('annual');
    const is4Months = cycle.includes('4_month') || cycle.includes('4month');
    const is6Months = cycle.includes('6_month') || cycle.includes('6month');
    
    // Calculate validity period & expiration date from stored validity
    const purchaseDate = new Date();
    const targetValidity = valid_until || options.valid_until;
    let expiryDate = targetValidity ? new Date(targetValidity) : new Date();
    if (!targetValidity || isNaN(expiryDate.getTime())) {
        expiryDate = new Date();
        if (isAnnual) {
            expiryDate.setFullYear(expiryDate.getFullYear() + 1);
        } else if (is4Months) {
            expiryDate.setMonth(expiryDate.getMonth() + 4);
        } else if (is6Months) {
            expiryDate.setMonth(expiryDate.getMonth() + 6);
        } else {
            expiryDate.setDate(expiryDate.getDate() + 30);
        }
    }

    const formattedPurchaseDate = purchaseDate.toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
    });

    const formattedExpiryDate = expiryDate.toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
    });

    let validityText = '1 Month (30 Days)';
    if (isAnnual) validityText = '1 Year (365 Days)';
    else if (is4Months) validityText = '4 Months (120 Days)';
    else if (is6Months) validityText = '6 Months (180 Days)';
    const numOrig = parseFloat(original_amount || 0);
    const numDisc = parseFloat(discount_amount || 0);
    const numFee = parseFloat(convenience_fee || options.convenience_fee || 0);
    const numFinal = parseFloat(final_amount || 0);

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Subscription Receipt - Inspenox Business Suite</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0b1120; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f1f5f9;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #0b1120; padding: 30px 15px;">
        <tr>
            <td align="center">
                <table width="100%" max-width="600" cellpadding="0" cellspacing="0" border="0" style="max-width: 600px; background-color: #111827; border-radius: 16px; border: 1px solid rgba(255,255,255,0.08); overflow: hidden; box-shadow: 0 20px 40px rgba(0,0,0,0.5);">
                    <!-- Header -->
                    <tr>
                        <td style="padding: 32px 36px; background: linear-gradient(135deg, rgba(0,168,132,0.2) 0%, rgba(17,24,39,1) 100%); border-bottom: 1px solid rgba(255,255,255,0.06); text-align: center;">
                            <div style="font-size: 26px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px;">
                                ⚡ <span style="color: #00a884;">Inspenox</span> Business Suite
                            </div>
                            <div style="font-size: 13px; color: #94a3b8; margin-top: 6px; letter-spacing: 0.5px; text-transform: uppercase;">
                                Official Payment Receipt & Subscription Activation
                            </div>
                        </td>
                    </tr>

                    <!-- Success Hero -->
                    <tr>
                        <td style="padding: 30px 36px 20px 36px; text-align: center;">
                            <div style="width: 54px; height: 54px; line-height: 54px; border-radius: 50%; background: rgba(0,168,132,0.15); border: 1px solid rgba(0,168,132,0.3); font-size: 24px; margin: 0 auto 16px auto;">
                                ✅
                            </div>
                            <h2 style="margin: 0 0 8px 0; color: #ffffff; font-size: 22px; font-weight: 700;">Payment Successful!</h2>
                            <p style="margin: 0; color: #94a3b8; font-size: 14px; line-height: 1.5;">
                                Your workspace subscription has been verified and active features are immediately unlocked.
                            </p>
                        </td>
                    </tr>

                    <!-- Plan Details Box -->
                    <tr>
                        <td style="padding: 10px 36px 20px 36px;">
                            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #1e293b; border-radius: 12px; border: 1px solid rgba(255,255,255,0.06); padding: 20px;">
                                <tr>
                                    <td style="padding-bottom: 12px; border-bottom: 1px solid rgba(255,255,255,0.06);">
                                        <div style="font-size: 12px; color: #94a3b8; text-transform: uppercase; font-weight: 600;">Subscribed Tier</div>
                                        <div style="font-size: 20px; font-weight: 800; color: #00a884; margin-top: 4px;">${plan_name}</div>
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding-top: 14px;">
                                        <table width="100%" cellpadding="4" cellspacing="0" border="0">
                                            <tr>
                                                <td style="font-size: 13px; color: #94a3b8;">Validity Duration:</td>
                                                <td align="right" style="font-size: 13px; font-weight: 600; color: #f1f5f9;">${validityText}</td>
                                            </tr>
                                            <tr>
                                                <td style="font-size: 13px; color: #94a3b8;">Activation Date:</td>
                                                <td align="right" style="font-size: 13px; font-weight: 600; color: #f1f5f9;">${formattedPurchaseDate}</td>
                                            </tr>
                                            <tr>
                                                <td style="font-size: 13px; color: #94a3b8;">Valid Until:</td>
                                                <td align="right" style="font-size: 13px; font-weight: 700; color: #10b981;">${formattedExpiryDate}</td>
                                            </tr>
                                            <tr>
                                                <td style="font-size: 13px; color: #94a3b8;">Billing Status:</td>
                                                <td align="right" style="font-size: 13px; font-weight: 700; color: #00a884;">Active (Paid via Razorpay)</td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <!-- Invoice Breakdown -->
                    <tr>
                        <td style="padding: 10px 36px 20px 36px;">
                            <div style="font-size: 12px; color: #94a3b8; text-transform: uppercase; font-weight: 700; margin-bottom: 10px; letter-spacing: 0.5px;">
                                Payment Breakdown
                            </div>
                            <table width="100%" cellpadding="6" cellspacing="0" border="0" style="font-size: 14px;">
                                <tr>
                                    <td style="color: #94a3b8; padding: 6px 0;">Base Package Amount</td>
                                    <td align="right" style="color: #f1f5f9; font-weight: 600;">₹${numOrig.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                </tr>
                                ${numDisc > 0 ? `
                                <tr>
                                    <td style="color: #10b981; padding: 6px 0;">Discount Claimed (${coupon_code || 'PROMO'})</td>
                                    <td align="right" style="color: #10b981; font-weight: 600;">- ₹${numDisc.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                </tr>
                                ` : ''}
                                ${numFee > 0 ? `
                                <tr>
                                    <td style="color: #94a3b8; padding: 6px 0;">Gateway Convenience Fee (2% + 18% GST)</td>
                                    <td align="right" style="color: #f1f5f9; font-weight: 600;">+ ₹${numFee.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                </tr>
                                ` : ''}
                                <tr>
                                    <td style="padding: 12px 0 6px 0; border-top: 1px solid rgba(255,255,255,0.1); color: #ffffff; font-size: 16px; font-weight: 800;">Total Paid</td>
                                    <td align="right" style="padding: 12px 0 6px 0; border-top: 1px solid rgba(255,255,255,0.1); color: #00a884; font-size: 18px; font-weight: 800;">₹${numFinal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <!-- Order Reference -->
                    <tr>
                        <td style="padding: 10px 36px 20px 36px;">
                            <table width="100%" cellpadding="6" cellspacing="0" border="0" style="background-color: rgba(255,255,255,0.03); border-radius: 8px; font-size: 12px; color: #94a3b8;">
                                <tr>
                                    <td>Order ID:</td>
                                    <td align="right" style="font-family: monospace; color: #f1f5f9;">${order_id || '-'}</td>
                                </tr>
                                <tr>
                                    <td>Payment ID:</td>
                                    <td align="right" style="font-family: monospace; color: #f1f5f9;">${payment_id || '-'}</td>
                                </tr>
                                <tr>
                                    <td>Subscriber:</td>
                                    <td align="right" style="color: #f1f5f9;">${to} ${phone ? `(${phone})` : ''}</td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <!-- CTA Button -->
                    <tr>
                        <td style="padding: 10px 36px 30px 36px; text-align: center;">
                            <a href="https://marketing.inspenox.in/#subscriptions" style="display: inline-block; background-color: #00a884; color: #ffffff; font-weight: 700; font-size: 15px; padding: 12px 28px; border-radius: 8px; text-decoration: none; box-shadow: 0 4px 14px rgba(0,168,132,0.4);">
                                Access Your Workspace 🚀
                            </a>
                        </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                        <td style="padding: 24px 36px; background-color: #0a0f1d; border-top: 1px solid rgba(255,255,255,0.06); text-align: center; font-size: 12px; color: #64748b; line-height: 1.6;">
                            This is an automated payment confirmation receipt issued by <strong>Inspenox Business Suite</strong>.<br>
                            If you have questions regarding your plan or billing, reach out to <a href="mailto:support@inspenox.in" style="color: #00a884; text-decoration: none;">support@inspenox.in</a>.
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
    `;

    const emailSubject = `🎉 Payment Receipt & Subscription Activated: ${plan_name}`;
    const plainText = `Payment confirmed for ${plan_name}! Total Amount Paid: ₹${numFinal}. Validity: ${validityText}. Order ID: ${order_id || '-'}.`;

    // Strategy 1: Attempt Cloudflare WorkerMailer (uses cloudflare:sockets directly in Cloudflare runtime)
    try {
        let wm = null;
        try {
            wm = require('worker-mailer');
        } catch(e) {}

        if (wm && wm.WorkerMailer) {
            console.log('Dispatching subscription receipt via Cloudflare WorkerMailer (cloudflare:sockets)...');
            await wm.WorkerMailer.send({
                host: 'smtp.gmail.com',
                port: 465,
                secure: true,
                credentials: {
                    username: creds.user,
                    password: creds.pass
                },
                authType: ['login', 'plain']
            }, {
                from: { name: 'Inspenox Business Suite', email: creds.user },
                to: to,
                subject: emailSubject,
                html: htmlContent,
                text: plainText
            });
            console.log('Subscription receipt email successfully sent via WorkerMailer!');
            return { success: true, engine: 'worker-mailer' };
        }
    } catch (wmErr) {
        console.warn('WorkerMailer send attempt failed, attempting nodemailer fallback:', wmErr.message);
    }

    // Strategy 2: Attempt standard Node.js nodemailer
    try {
        let nm = null;
        try {
            nm = require('nodemailer');
        } catch(e) {}

        if (nm) {
            console.log('Dispatching subscription receipt via nodemailer...');
            const transporter = nm.createTransport({
                service: 'gmail',
                auth: {
                    user: creds.user,
                    pass: creds.pass
                }
            });

            const info = await transporter.sendMail({
                from: `"Inspenox Business Suite" <${creds.user}>`,
                to: to,
                subject: emailSubject,
                html: htmlContent,
                text: plainText
            });
            console.log('Subscription receipt email successfully sent via nodemailer:', info.messageId);
            return { success: true, messageId: info.messageId, engine: 'nodemailer' };
        }
    } catch (nmErr) {
        console.error('nodemailer send failed:', nmErr.message);
        return { success: false, error: nmErr.message };
    }

    return { success: false, error: 'No compatible mail engine available' };
}

module.exports = {
    sendSubscriptionReceiptEmail,
    getTransporter,
    getCredentials
};
