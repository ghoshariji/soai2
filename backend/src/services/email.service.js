const nodemailer = require('nodemailer');
const logger = require('../utils/logger');

const createTransporter = () =>
  nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: parseInt(process.env.EMAIL_PORT, 10),
    secure: parseInt(process.env.EMAIL_PORT, 10) === 465,
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
  });

const sendEmail = async (to, subject, html) => {
  try {
    const transporter = createTransporter();
    const info = await transporter.sendMail({
      from: `"${process.env.EMAIL_FROM_NAME}" <${process.env.EMAIL_FROM}>`,
      to,
      subject,
      html,
    });
    logger.info(`Email sent to ${to}: ${info.messageId}`);
    return info;
  } catch (error) {
    logger.error(`Failed to send email to ${to}: ${error.message}`);
    throw error;
  }
};

const baseTemplate = (content) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>SOAI Platform</title>
</head>
<body style="margin:0;padding:0;background:#0f1117;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f1117;min-height:100vh;">
    <tr><td align="center" style="padding:40px 16px;">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#6c63ff,#4f46e5);border-radius:16px 16px 0 0;padding:32px 40px;text-align:center;">
            <h1 style="margin:0;color:#fff;font-size:28px;font-weight:700;letter-spacing:-0.5px;">SOAI Platform</h1>
            <p style="margin:8px 0 0;color:rgba(255,255,255,0.8);font-size:14px;">Society Management System</p>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="background:#1a1d27;padding:40px;border-left:1px solid #2a2d3a;border-right:1px solid #2a2d3a;">
            ${content}
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background:#12141e;border-radius:0 0 16px 16px;border:1px solid #2a2d3a;border-top:none;padding:24px 40px;text-align:center;">
            <p style="margin:0;color:#6b7280;font-size:12px;">© ${new Date().getFullYear()} SOAI Platform. All rights reserved.</p>
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

const sendWelcomeEmail = async (adminUser, password) => {
  const html = baseTemplate(`
    <h2 style="color:#fff;margin:0 0 8px;font-size:22px;">Welcome, ${adminUser.name}! 👋</h2>
    <p style="color:#9ca3af;margin:0 0 24px;font-size:15px;line-height:1.6;">
      You have been assigned as the <strong style="color:#6c63ff;">Society Admin</strong> on the SOAI Platform.
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
  return sendEmail(adminUser.email, 'Welcome to SOAI Platform – Your Admin Credentials', html);
};

const sendUserWelcomeEmail = async (user, password, societyName) => {
  const html = baseTemplate(`
    <h2 style="color:#fff;margin:0 0 8px;font-size:22px;">Welcome to ${societyName}! 🏡</h2>
    <p style="color:#9ca3af;margin:0 0 24px;font-size:15px;line-height:1.6;">
      Your resident account has been created on <strong style="color:#6c63ff;">SOAI Platform</strong>.
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
  return sendEmail(user.email, `Welcome to ${societyName} – SOAI Platform`, html);
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
  return sendEmail(user.email, 'SOAI Platform – Password Reset', html);
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
      Please contact the SOAI Platform support team or renew directly from the admin portal.
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

module.exports = {
  sendEmail,
  sendWelcomeEmail,
  sendUserWelcomeEmail,
  sendPasswordResetEmail,
  sendSubscriptionExpiryWarning,
  sendSubscriptionExpiredEmail,
  sendComplaintUpdateEmail,
};
