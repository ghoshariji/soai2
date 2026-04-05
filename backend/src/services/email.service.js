'use strict';

/**
 * Central e-mail delivery via Nodemailer (SMTP).
 *
 * Environment (primary names — legacy aliases in resolveMailConfig):
 *   EMAIL_HOST, EMAIL_PORT, EMAIL_USER, EMAIL_PASS
 *   EMAIL_FROM, EMAIL_FROM_NAME
 *
 * Legacy fallbacks: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM_NAME
 */

const nodemailer = require('nodemailer');
const logger = require('../utils/logger');

// ─────────────────────────────────────────────────────────────────────────────
// Config & transporter (singleton)
// ─────────────────────────────────────────────────────────────────────────────

function resolveMailConfig() {
  const host =
    process.env.EMAIL_HOST || process.env.SMTP_HOST || '';
  const portRaw =
    process.env.EMAIL_PORT || process.env.SMTP_PORT || '587';
  const port = parseInt(portRaw, 10);
  const safePort = Number.isFinite(port) && port > 0 ? port : 587;

  const user =
    process.env.EMAIL_USER || process.env.SMTP_USER || '';
  const pass =
    process.env.EMAIL_PASS || process.env.SMTP_PASS || '';

  const fromAddress =
    process.env.EMAIL_FROM ||
    process.env.SMTP_USER ||
    user ||
    '';

  const fromName =
    process.env.EMAIL_FROM_NAME ||
    process.env.MAIL_FROM_NAME ||
    'SocietyWale';

  return {
    host: host.trim(),
    port: safePort,
    user: user.trim(),
    pass,
    fromAddress: fromAddress.trim(),
    fromName: fromName.trim(),
  };
}

function isEmailConfigured() {
  const c = resolveMailConfig();
  return Boolean(c.host && c.user && c.pass && c.fromAddress);
}

let _transporter = null;

function getTransporter() {
  if (_transporter) return _transporter;

  const c = resolveMailConfig();
  if (!c.host || !c.user || !c.pass) {
    return null;
  }

  const secure = c.port === 465;

  _transporter = nodemailer.createTransport({
    host: c.host,
    port: c.port,
    secure,
    auth: { user: c.user, pass: c.pass },
    pool: true,
    maxConnections: 5,
    maxMessages: 100,
    // STARTTLS on 587 is default for most providers
    requireTLS: c.port === 587,
  });

  return _transporter;
}

function getFromHeader() {
  const c = resolveMailConfig();
  return `"${c.fromName}" <${c.fromAddress}>`;
}

/**
 * Low-level send. Throws if SMTP is not configured or send fails.
 */
const sendEmail = async (to, subject, html, text) => {
  const transport = getTransporter();
  if (!transport) {
    const err = new Error('Email (SMTP) is not configured');
    err.code = 'EMAIL_NOT_CONFIGURED';
    throw err;
  }

  try {
    const info = await transport.sendMail({
      from: getFromHeader(),
      to,
      subject,
      html,
      ...(text ? { text } : {}),
    });
    logger.info(`[email] Sent to ${to}: ${info.messageId}`);
    return info;
  } catch (error) {
    logger.error(`[email] Failed to send to ${to}: ${error.message}`);
    throw error;
  }
};

/**
 * Fire-and-forget friendly: logs and does not throw.
 */
const sendEmailQuiet = async (to, subject, html) => {
  try {
    await sendEmail(to, subject, html);
  } catch (err) {
    if (err.code === 'EMAIL_NOT_CONFIGURED') {
      logger.warn('[email] SMTP not configured – message skipped.');
    } else {
      logger.error(`[email] Send failed (quiet) to ${to}: ${err.message}`);
    }
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// HTML layout
// ─────────────────────────────────────────────────────────────────────────────

const baseTemplate = (content) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>SocietyWale</title>
</head>
<body style="margin:0;padding:0;background:#0f1117;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f1117;min-height:100vh;">
    <tr><td align="center" style="padding:40px 16px;">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <tr>
          <td style="background:linear-gradient(135deg,#6c63ff,#4f46e5);border-radius:16px 16px 0 0;padding:32px 40px;text-align:center;">
            <h1 style="margin:0;color:#fff;font-size:28px;font-weight:700;letter-spacing:-0.5px;">SocietyWale</h1>
            <p style="margin:8px 0 0;color:rgba(255,255,255,0.8);font-size:14px;">Society Management System</p>
          </td>
        </tr>
        <tr>
          <td style="background:#1a1d27;padding:40px;border-left:1px solid #2a2d3a;border-right:1px solid #2a2d3a;">
            ${content}
          </td>
        </tr>
        <tr>
          <td style="background:#12141e;border-radius:0 0 16px 16px;border:1px solid #2a2d3a;border-top:none;padding:24px 40px;text-align:center;">
            <p style="margin:0;color:#6b7280;font-size:12px;">© ${new Date().getFullYear()} SocietyWale. All rights reserved.</p>
            <p style="margin:8px 0 0;color:#6b7280;font-size:12px;">This is an automated email. Please do not reply.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

const credentialBox = (label, value) => `
  <tr>
    <td style="padding:6px 0;">
      <span style="color:#9ca3af;font-size:13px;">${label}:</span>
      <span style="color:#e5e7eb;font-size:13px;margin-left:8px;font-weight:600;">${value}</span>
    </td>
  </tr>`;

// ─────────────────────────────────────────────────────────────────────────────
// Typed sends
// ─────────────────────────────────────────────────────────────────────────────

const sendWelcomeEmail = async (adminUser, password) => {
  const html = baseTemplate(`
    <h2 style="color:#fff;margin:0 0 8px;font-size:22px;">Welcome, ${adminUser.name}! 👋</h2>
    <p style="color:#9ca3af;margin:0 0 24px;font-size:15px;line-height:1.6;">
      You have been assigned as the <strong style="color:#6c63ff;">Society Admin</strong> on the SocietyWale.
      Below are your login credentials. Please change your password after first login.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0"
      style="background:#12141e;border:1px solid #2a2d3a;border-radius:12px;padding:20px 24px;margin-bottom:24px;">
      ${credentialBox('Email', adminUser.email)}
      ${credentialBox('Temporary Password', password)}
      ${credentialBox('Role', 'Society Admin')}
    </table>
    <div style="text-align:center;">
      <a href="#" style="display:inline-block;background:linear-gradient(135deg,#6c63ff,#4f46e5);color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:15px;font-weight:600;">
        Login to Dashboard →
      </a>
    </div>
    <p style="color:#6b7280;font-size:12px;margin:24px 0 0;text-align:center;">
      Keep your credentials secure. Do not share them with anyone.
    </p>`);
  return sendEmail(adminUser.email, 'Welcome to SocietyWale – Your Admin Credentials', html);
};

/**
 * When a super admin creates a new society — welcome e-mail with login link.
 */
const sendNewSocietyAdminWelcome = async ({
  name,
  email,
  password,
  societyName,
}) => {
  const appUrl =
    process.env.FRONTEND_URL ||
    process.env.APP_URL ||
    'https://app.societywale.in';
  const loginUrl = `${appUrl.replace(/\/$/, '')}/login`;

  const html = baseTemplate(`
    <h2 style="color:#fff;margin:0 0 8px;font-size:22px;">Welcome to ${societyName}!</h2>
    <p style="color:#9ca3af;margin:0 0 24px;font-size:15px;line-height:1.6;">
      Hi <strong style="color:#e5e7eb;">${name}</strong>, your society is registered on <strong style="color:#6c63ff;">SocietyWale</strong>.
      Use the credentials below to sign in for the first time.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0"
      style="background:#12141e;border:1px solid #2a2d3a;border-radius:12px;padding:20px 24px;margin-bottom:24px;">
      ${credentialBox('Email', email)}
      ${credentialBox('Temporary password', password)}
    </table>
    <p style="color:#f87171;font-size:13px;margin:0 0 20px;">
      Please change your password immediately after your first login.
    </p>
    <div style="text-align:center;">
      <a href="${loginUrl}" style="display:inline-block;background:linear-gradient(135deg,#6c63ff,#4f46e5);color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:15px;font-weight:600;">
        Log in to SocietyWale
      </a>
    </div>`);

  return sendEmailQuiet(
    email,
    `Welcome to ${societyName} – Your admin credentials`,
    html,
  );
};

const sendUserWelcomeEmail = async (user, password, societyName) => {
  const html = baseTemplate(`
    <h2 style="color:#fff;margin:0 0 8px;font-size:22px;">Welcome to ${societyName}! 🏡</h2>
    <p style="color:#9ca3af;margin:0 0 24px;font-size:15px;line-height:1.6;">
      Your resident account has been created on <strong style="color:#6c63ff;">SocietyWale</strong>.
      Use the credentials below to access your community app.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0"
      style="background:#12141e;border:1px solid #2a2d3a;border-radius:12px;padding:20px 24px;margin-bottom:24px;">
      ${credentialBox('Name', user.name)}
      ${credentialBox('Email', user.email)}
      ${credentialBox('Password', password)}
      ${user.flatNumber ? credentialBox('Flat / Unit', user.flatNumber) : ''}
    </table>
    <p style="color:#9ca3af;font-size:14px;margin:0;line-height:1.6;">
      You can now access announcements, community feeds, raise complaints, and chat with your neighbours.
    </p>`);
  return sendEmail(user.email, `Welcome to ${societyName} – SocietyWale`, html);
};

/**
 * Resident welcome (create user / bulk) — never throws; skips if SMTP missing.
 */
const sendResidentWelcomeEmail = async (
  { name, email, flatNumber },
  password,
  societyName = 'your society',
) => {
  if (!isEmailConfigured()) {
    logger.warn('[email] SMTP not configured – skipping resident welcome email');
    return;
  }
  try {
    await sendUserWelcomeEmail(
      { name, email, flatNumber },
      password,
      societyName,
    );
  } catch (err) {
    logger.error(`[email] Resident welcome failed for ${email}: ${err.message}`);
  }
};

const sendPasswordResetEmail = async (user, resetToken) => {
  const html = baseTemplate(`
    <h2 style="color:#fff;margin:0 0 8px;font-size:22px;">Password Reset Request 🔐</h2>
    <p style="color:#9ca3af;margin:0 0 24px;font-size:15px;line-height:1.6;">
      We received a request to reset your password. Use the token below. It expires in <strong style="color:#f59e0b;">15 minutes</strong>.
    </p>
    <div style="background:#12141e;border:1px solid #2a2d3a;border-radius:12px;padding:20px 24px;text-align:center;margin-bottom:24px;">
      <span style="font-size:28px;font-weight:700;letter-spacing:6px;color:#6c63ff;">${resetToken}</span>
    </div>
    <p style="color:#ef4444;font-size:13px;margin:0;text-align:center;">
      If you did not request this, please ignore this email and secure your account.
    </p>`);
  return sendEmail(user.email, 'SocietyWale – Password Reset', html);
};

const sendSubscriptionExpiryWarning = async (adminEmail, societyName, daysLeft, expiryDate) => {
  const html = baseTemplate(`
    <h2 style="color:#f59e0b;margin:0 0 8px;font-size:22px;">⚠️ Subscription Expiring Soon</h2>
    <p style="color:#9ca3af;margin:0 0 24px;font-size:15px;line-height:1.6;">
      The subscription for <strong style="color:#fff;">${societyName}</strong> will expire in
      <strong style="color:#f59e0b;">${daysLeft} day${daysLeft !== 1 ? 's' : ''}</strong> on
      <strong style="color:#fff;">${new Date(expiryDate).toDateString()}</strong>.
    </p>
    <p style="color:#9ca3af;font-size:14px;line-height:1.6;">
      Please renew your subscription to continue enjoying uninterrupted access to all platform features.
      After expiry, all resident logins will be suspended.
    </p>
    <div style="text-align:center;margin-top:24px;">
      <a href="#" style="display:inline-block;background:linear-gradient(135deg,#f59e0b,#d97706);color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:15px;font-weight:600;">
        Renew Subscription →
      </a>
    </div>`);
  return sendEmail(adminEmail, `⚠️ Subscription Expiring in ${daysLeft} Days – ${societyName}`, html);
};

const sendSubscriptionExpiredEmail = async (adminEmail, societyName) => {
  const html = baseTemplate(`
    <h2 style="color:#ef4444;margin:0 0 8px;font-size:22px;">🚫 Subscription Expired</h2>
    <p style="color:#9ca3af;margin:0 0 24px;font-size:15px;line-height:1.6;">
      The subscription for <strong style="color:#fff;">${societyName}</strong> has expired.
      All resident logins have been suspended until the subscription is renewed.
    </p>
    <p style="color:#9ca3af;font-size:14px;line-height:1.6;">
      Please contact the SocietyWale support team or renew directly from the admin portal.
    </p>`);
  return sendEmail(adminEmail, `🚫 Subscription Expired – ${societyName}`, html);
};

const sendComplaintUpdateEmail = async (userEmail, complaint) => {
  const statusColors = { open: '#6b7280', in_progress: '#f59e0b', resolved: '#10b981', closed: '#6b7280' };
  const color = statusColors[complaint.status] || '#6b7280';
  const html = baseTemplate(`
    <h2 style="color:#fff;margin:0 0 8px;font-size:22px;">Complaint Update 📋</h2>
    <p style="color:#9ca3af;margin:0 0 24px;font-size:15px;line-height:1.6;">
      Your complaint has been updated. Here are the details:
    </p>
    <table width="100%" cellpadding="0" cellspacing="0"
      style="background:#12141e;border:1px solid #2a2d3a;border-radius:12px;padding:20px 24px;margin-bottom:24px;">
      ${credentialBox('Title', complaint.title)}
      <tr><td style="padding:6px 0;">
        <span style="color:#9ca3af;font-size:13px;">Status:</span>
        <span style="color:${color};font-size:13px;margin-left:8px;font-weight:700;text-transform:uppercase;">${complaint.status.replace('_', ' ')}</span>
      </td></tr>
      ${complaint.adminComments?.length ? credentialBox('Admin Comment', complaint.adminComments[complaint.adminComments.length - 1].comment) : ''}
    </table>`);
  return sendEmail(userEmail, `Complaint Update: ${complaint.title}`, html);
};

/**
 * Complaint status change (resident notification) — same behaviour as legacy controller helper.
 */
const sendComplaintStatusChangeEmail = async ({
  email,
  name,
  complaintTitle,
  newStatus,
  adminComment,
}) => {
  if (!email) return;
  if (!isEmailConfigured()) {
    logger.warn('[email] SMTP not configured – skipping complaint status email');
    return;
  }

  const statusLabel = newStatus.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const commentBlock = adminComment
    ? `<p><strong>Admin note:</strong> ${adminComment}</p>`
    : '';

  const html = `
    <p>Hi ${name},</p>
    <p>Your complaint <strong>"${complaintTitle}"</strong> has been updated.</p>
    <p><strong>New Status:</strong> ${statusLabel}</p>
    ${commentBlock}
    <p>You can log in to your society portal for more details.</p>
    <br/>
    <p>Regards,<br/>${resolveMailConfig().fromName} Team</p>
  `;

  try {
    await sendEmail(
      email,
      `Your complaint "${complaintTitle}" has been updated`,
      html,
    );
  } catch (err) {
    logger.warn(`[email] Complaint status email failed: ${err.message}`);
  }
};

module.exports = {
  sendEmail,
  sendEmailQuiet,
  isEmailConfigured,
  sendWelcomeEmail,
  sendNewSocietyAdminWelcome,
  sendUserWelcomeEmail,
  sendResidentWelcomeEmail,
  sendPasswordResetEmail,
  sendSubscriptionExpiryWarning,
  sendSubscriptionExpiredEmail,
  sendComplaintUpdateEmail,
  sendComplaintStatusChangeEmail,
};
