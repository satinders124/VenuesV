import * as admin from 'firebase-admin';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';

admin.initializeApp();

const SENDGRID_KEY = defineSecret('SG_0L1TZ3X_Q_GSKUST4X_UTGG_DDN_CY_P08UE_Y4BOP2OLR_LVJ_OZIGCBRY3YF0S_XV_YT6XW');
const FROM_EMAIL = 'noreply@venuesv.com';
const FROM_NAME  = 'Venues V';

// ── BASE TEMPLATE ─────────────────────────────────────────
const baseTemplate = (content: string) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; background:#f4f4f5; color:#1a1a2e; }
    .wrapper { max-width:600px; margin:40px auto; background:#ffffff; border-radius:16px; overflow:hidden; box-shadow:0 4px 24px rgba(0,0,0,.08); }
    .header { background:#080a0e; padding:32px; text-align:center; }
    .logo-v { display:inline-block; width:48px; height:48px; background:#0f1218; border-radius:12px; line-height:48px; font-size:28px; font-weight:900; color:#00c896; border:1px solid rgba(255,255,255,.1); }
    .brand { color:#ffffff; font-size:20px; font-weight:800; margin-top:12px; }
    .brand span { color:#00c896; }
    .body { padding:40px 32px; }
    .title { font-size:22px; font-weight:800; color:#111; margin-bottom:12px; }
    .text { font-size:15px; color:#555; line-height:1.7; margin-bottom:16px; }
    .btn { display:inline-block; background:#00c896; color:#000000 !important; font-weight:700; font-size:15px; padding:14px 32px; border-radius:10px; text-decoration:none; margin:8px 0; }
    .divider { height:1px; background:#f0f0f0; margin:24px 0; }
    .info-box { background:#f8f9fa; border-radius:10px; padding:20px; margin:16px 0; }
    .info-row { display:flex; justify-content:space-between; padding:10px 0; border-bottom:1px solid #eee; font-size:14px; }
    .info-row:last-child { border-bottom:none; }
    .info-label { color:#888; font-weight:500; }
    .info-val { color:#111; font-weight:700; }
    .password-box { background:#080a0e; border-radius:10px; padding:16px 20px; margin:16px 0; text-align:center; }
    .password-label { font-size:11px; color:#6e7a8a; font-weight:600; letter-spacing:.5px; text-transform:uppercase; margin-bottom:8px; }
    .password-val { font-size:22px; font-weight:900; color:#00c896; letter-spacing:2px; }
    .otp-box { background:#080a0e; border-radius:12px; padding:24px; margin:20px 0; text-align:center; }
    .otp-label { font-size:11px; color:#6e7a8a; font-weight:600; letter-spacing:.5px; text-transform:uppercase; margin-bottom:10px; }
    .otp-code { font-size:42px; font-weight:900; color:#00c896; letter-spacing:10px; }
    .otp-expiry { font-size:12px; color:#6e7a8a; margin-top:10px; }
    .steps { display:flex; flex-direction:column; gap:12px; margin:16px 0; }
    .step { display:flex; align-items:flex-start; gap:12px; }
    .step-num { width:28px; height:28px; background:#00c896; border-radius:99px; display:flex; align-items:center; justify-content:center; font-size:13px; font-weight:800; color:#000; flex-shrink:0; line-height:28px; text-align:center; }
    .step-text { font-size:14px; color:#555; line-height:1.6; padding-top:4px; }
    .footer { background:#f8f9fa; padding:24px 32px; text-align:center; border-top:1px solid #eee; }
    .footer-text { font-size:12px; color:#999; line-height:1.6; }
    .footer-link { color:#00c896; text-decoration:none; }
    .role-badge { display:inline-block; padding:4px 14px; border-radius:99px; font-size:12px; font-weight:700; background:#dcfce7; color:#16a34a; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <div class="logo-v">V</div>
      <div class="brand">Venues <span>V</span></div>
    </div>
    <div class="body">${content}</div>
    <div class="footer">
      <p class="footer-text">
        Venues V — Venue Operations Platform<br/>
        <a href="https://venuesv.com" class="footer-link">venuesv.com</a> &nbsp;·&nbsp;
        <a href="mailto:hello@venuesv.com" class="footer-link">hello@venuesv.com</a>
      </p>
    </div>
  </div>
</body>
</html>`;

// ── OTP EMAIL TEMPLATE ────────────────────────────────────
const otpTemplate = (name: string, code: string) =>
  baseTemplate(`
    <h2 class="title">Verify your email 📧</h2>
    <p class="text">Hi <strong>${name}</strong>, here is your verification code for Venues V:</p>
    <div class="otp-box">
      <div class="otp-label">Your verification code</div>
      <div class="otp-code">${code}</div>
      <div class="otp-expiry">⏱ Expires in 10 minutes</div>
    </div>
    <p class="text">Enter this code on the Venues V signup page to verify your email address.</p>
    <div class="divider"></div>
    <p class="text" style="font-size:13px;color:#999">
      If you didn't request this code, you can safely ignore this email.<br/>
      Questions? Email <a href="mailto:hello@venuesv.com" style="color:#00c896">hello@venuesv.com</a>
    </p>
  `);

// ── INVITE TEMPLATE ───────────────────────────────────────
const inviteTemplate = (name: string, venueName: string, role: string, tempPassword: string) =>
  baseTemplate(`
    <h2 class="title">You've been invited! 🎉</h2>
    <p class="text">Hi <strong>${name}</strong>, you've been added to <strong>${venueName}</strong> as a <strong>${role}</strong>.</p>
    <div class="info-box">
      <div class="info-row"><span class="info-label">Venue</span><span class="info-val">${venueName}</span></div>
      <div class="info-row"><span class="info-label">Your Role</span><span class="info-val"><span class="role-badge">${role}</span></span></div>
    </div>
    <p class="text">Your temporary password is:</p>
    <div class="password-box">
      <div class="password-label">Temporary Password</div>
      <div class="password-val">${tempPassword}</div>
    </div>
    <p class="text">To get started:</p>
    <div class="steps">
      <div class="step"><div class="step-num">1</div><div class="step-text">Download the <strong>Venues V</strong> app from the App Store or Google Play</div></div>
      <div class="step"><div class="step-num">2</div><div class="step-text">Sign in with your email and the temporary password above</div></div>
      <div class="step"><div class="step-num">3</div><div class="step-text">You're in! Start managing tasks and issues at ${venueName}</div></div>
    </div>
    <div class="divider"></div>
    <p class="text" style="font-size:13px;color:#999">Please change your password after first login. Questions? Email <a href="mailto:hello@venuesv.com" style="color:#00c896">hello@venuesv.com</a></p>
  `);

// ── WELCOME OWNER TEMPLATE ────────────────────────────────
const welcomeOwnerTemplate = (name: string) =>
  baseTemplate(`
    <h2 class="title">Thanks for signing up! 🎉</h2>
    <p class="text">Hi <strong>${name}</strong>, welcome to Venues V!</p>
    <p class="text">
      We're currently setting up your dashboard. You'll receive a separate email 
      with your <strong>login credentials</strong> within the next few hours so you can 
      log in to the app and get started.
    </p>
    <div class="info-box">
      <div class="info-row">
        <span class="info-label">Status</span>
        <span class="info-val" style="color:#00c896">⏳ Dashboard being created</span>
      </div>
      <div class="info-row">
        <span class="info-label">Trial</span>
        <span class="info-val">14 days free — starts today</span>
      </div>
      <div class="info-row">
        <span class="info-label">Support</span>
        <span class="info-val">hello@venuesv.com</span>
      </div>
    </div>
    <p class="text">While you wait, download the <strong>Venues V</strong> app so you're ready to go when your credentials arrive.</p>
    <a href="https://apps.apple.com" class="btn">📱 Download on App Store →</a>
    <div class="divider"></div>
    <p class="text" style="font-size:13px;color:#999">
      Questions? Reply to this email or contact us at 
      <a href="mailto:hello@venuesv.com" style="color:#00c896">hello@venuesv.com</a>
    </p>
  `);

// ── CREDENTIALS TEMPLATE ──────────────────────────────────
const credentialsTemplate = (name: string, email: string, password: string) =>
  baseTemplate(`
    <h2 class="title">Your login credentials are ready! 🚀</h2>
    <p class="text">Hi <strong>${name}</strong>, your Venues V dashboard is all set up. Here are your login details:</p>
    <div class="info-box">
      <div class="info-row"><span class="info-label">Email</span><span class="info-val">${email}</span></div>
      <div class="info-row"><span class="info-label">Password</span><span class="info-val">${password}</span></div>
      <div class="info-row"><span class="info-label">App</span><span class="info-val">Venues V (iOS & Android)</span></div>
      <div class="info-row"><span class="info-label">Dashboard</span><span class="info-val">client.venuesv.com</span></div>
    </div>
    <p class="text">To get started:</p>
    <div class="steps">
      <div class="step"><div class="step-num">1</div><div class="step-text">Download the <strong>Venues V</strong> app from the App Store or Google Play</div></div>
      <div class="step"><div class="step-num">2</div><div class="step-text">Sign in with the email and password above</div></div>
      <div class="step"><div class="step-num">3</div><div class="step-text">Add your venue — tap <strong>More → Add Venue</strong></div></div>
      <div class="step"><div class="step-num">4</div><div class="step-text">Invite your team — tap <strong>More → Team</strong></div></div>
      <div class="step"><div class="step-num">5</div><div class="step-text">Access your owner dashboard at <strong>client.venuesv.com</strong></div></div>
    </div>
    <a href="https://client.venuesv.com" class="btn">Open Owner Dashboard →</a>
    <div class="divider"></div>
    <p class="text" style="font-size:13px;color:#999">
      We recommend changing your password after first login.<br/>
      Need help? Reply to this email or contact <a href="mailto:hello@venuesv.com" style="color:#00c896">hello@venuesv.com</a>
    </p>
  `);

// ── SEND OTP ──────────────────────────────────────────────
export const sendOTP = onRequest(
  {
    cors: true,
    secrets: [SENDGRID_KEY],
  },
  async (req, res) => {
    if (req.method !== 'POST') { res.status(405).send('Method not allowed'); return; }
    const { email, name } = req.body;
    if (!email || !name) { res.status(400).json({ error: 'Email and name required' }); return; }
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 10 * 60 * 1000;
    await admin.firestore().collection('otpCodes').doc(email).set({
      code, expiresAt, createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    try {
      const sgMail = require('@sendgrid/mail');
      sgMail.setApiKey(SENDGRID_KEY.value());
      await sgMail.send({
        to: email, from: { email: FROM_EMAIL, name: FROM_NAME },
        subject: `${code} — Your Venues V verification code`,
        html: otpTemplate(name, code),
      });
      res.status(200).json({ success: true });
    } catch (err) {
      console.error('SendGrid OTP error:', err);
      res.status(500).json({ error: 'Failed to send email' });
    }
  }
);

// ── VERIFY OTP ────────────────────────────────────────────
export const verifyOTP = onRequest(
  { cors: true },
  async (req, res) => {
    if (req.method !== 'POST') { res.status(405).send('Method not allowed'); return; }
    const { email, code } = req.body;
    if (!email || !code) { res.status(400).json({ error: 'Email and code required' }); return; }
    const snap = await admin.firestore().collection('otpCodes').doc(email).get();
    if (!snap.exists) { res.status(400).json({ error: 'No code found. Please request a new one.' }); return; }
    const data = snap.data()!;
    if (Date.now() > data.expiresAt) {
      await admin.firestore().collection('otpCodes').doc(email).delete();
      res.status(400).json({ error: 'Code expired. Please request a new one.' }); return;
    }
    if (data.code !== code) { res.status(400).json({ error: 'Incorrect code. Please try again.' }); return; }
    await admin.firestore().collection('otpCodes').doc(email).delete();
    res.status(200).json({ success: true });
  }
);

// ── SEND CREDENTIALS ──────────────────────────────────────
export const sendCredentials = onRequest(
  {
    cors: true,
    secrets: [SENDGRID_KEY],
  },
  async (req, res) => {
    if (req.method !== 'POST') { res.status(405).send('Method not allowed'); return; }
    const { email, name, password, adminKey } = req.body;
    if (adminKey !== 'venuesv-admin-2026') { res.status(401).json({ error: 'Unauthorised' }); return; }
    if (!email || !name || !password) { res.status(400).json({ error: 'Email, name and password required' }); return; }
    try {
      const sgMail = require('@sendgrid/mail');
      sgMail.setApiKey(SENDGRID_KEY.value());
      await sgMail.send({
        to: email,
        from: { email: FROM_EMAIL, name: FROM_NAME },
        subject: `Your Venues V login credentials are ready 🚀`,
        html: credentialsTemplate(name, email, password),
      });
      console.log(`Credentials sent to: ${email}`);
      res.status(200).json({ success: true });
    } catch (err) {
      console.error('Credentials error:', err);
      res.status(500).json({ error: 'Failed to send email' });
    }
  }
);

// ── ON USER CREATED ───────────────────────────────────────
export const onUserCreated = onDocumentCreated(
  {
    document: 'users/{userId}',
    secrets: [SENDGRID_KEY],
  },
  async (event) => {
    const data = event.data?.data();
    if (!data?.email || !data?.name) return null;
    const sgMail = require('@sendgrid/mail');
    sgMail.setApiKey(SENDGRID_KEY.value());
    const roleLabel: Record<string, string> = {
      owner: 'Owner', manager: 'Site Manager', cleaner: 'Cleaner', staff: 'Staff',
    };
    try {
      if (data.role === 'owner') {
        await sgMail.send({
          to: data.email, from: { email: FROM_EMAIL, name: FROM_NAME },
          subject: `Thanks for signing up with Venues V, ${data.name.split(' ')[0]}!`,
          html: welcomeOwnerTemplate(data.name),
        });
        console.log(`Welcome email sent to owner: ${data.email}`);
      } else {
        await sgMail.send({
          to: data.email, from: { email: FROM_EMAIL, name: FROM_NAME },
          subject: `You've been invited to ${data.venue || 'Venues V'} 🎉`,
          html: inviteTemplate(data.name, data.venue || 'your venue', roleLabel[data.role] || data.role, data.tempPassword || 'Contact your manager for login details'),
        });
        console.log(`Invite email sent to ${data.role}: ${data.email}`);
      }
    } catch (err) { console.error('SendGrid error:', err); }
    return null;
  }
);

// ── ON NEW SIGNUP ALERT ───────────────────────────────────
export const onNewSignup = onDocumentCreated(
  {
    document: 'signupLeads/{leadId}',
    secrets: [SENDGRID_KEY],
  },
  async (event) => {
    const data = event.data?.data();
    if (!data?.email || !data?.name) return null;
    const sgMail = require('@sendgrid/mail');
    sgMail.setApiKey(SENDGRID_KEY.value());
    const trialEnd = data.trialEndsAt?.toDate ? data.trialEndsAt.toDate().toLocaleDateString('en-AU') : 'Unknown';
    try {
      await sgMail.send({
        to: 'sasukhman1@gmail.com',
        from: { email: FROM_EMAIL, name: FROM_NAME },
        subject: `🔔 New signup — ${data.name}`,
        html: baseTemplate(`
          <h2 class="title">New Signup Alert 🔔</h2>
          <p class="text">Someone just signed up for a free trial on venuesv.com.</p>
          <div class="info-box">
            <div class="info-row"><span class="info-label">Name</span><span class="info-val">${data.name}</span></div>
            <div class="info-row"><span class="info-label">Email</span><span class="info-val">${data.email}</span></div>
            <div class="info-row"><span class="info-label">Phone</span><span class="info-val">${data.phone||'—'}</span></div>
            <div class="info-row"><span class="info-label">Plan</span><span class="info-val">${data.plan||'$19.99/week'}</span></div>
            <div class="info-row"><span class="info-label">Trial Ends</span><span class="info-val">${trialEnd}</span></div>
            <div class="info-row"><span class="info-label">Marketing Opt-in</span><span class="info-val">${data.marketingOptIn?'Yes':'No'}</span></div>
          </div>
          <p class="text"><strong>Action required:</strong> Create their Firebase account and send login credentials via the admin panel.</p>
          <a href="https://admin.venuesv.com" class="btn">Open Admin Panel →</a>
          <div class="divider"></div>
          <p class="text" style="font-size:13px;color:#999">This is an automated alert from Venues V.</p>
        `),
      });
      console.log(`Alert sent for: ${data.email}`);
    } catch (err) { console.error('Alert error:', err); }
    return null;
  }
);

// ── CREATE AUTH USER (called from admin panel) ────────────
export const createAuthUser = onRequest(
  {
    cors: true,
    secrets: [SENDGRID_KEY],
  },
  async (req, res) => {
    if (req.method !== 'POST') { res.status(405).send('Method not allowed'); return; }

    const { email, name, password, adminKey, docId } = req.body;

    if (adminKey !== 'venuesv-admin-2026') {
      res.status(401).json({ error: 'Unauthorised' }); return;
    }
    if (!email || !name || !password) {
      res.status(400).json({ error: 'Email, name and password required' }); return;
    }

    try {
      // Create Firebase Auth account using Admin SDK
      let uid: string;
      try {
        const userRecord = await admin.auth().createUser({
          email,
          password,
          displayName: name,
        });
        uid = userRecord.uid;
      } catch (authErr: any) {
        if (authErr.code === 'auth/email-already-exists') {
          // User already exists — get their UID
          const existing = await admin.auth().getUserByEmail(email);
          uid = existing.uid;
          // Update their password
          await admin.auth().updateUser(uid, { password });
        } else {
          throw authErr;
        }
      }

      // Update the signupLeads doc with uid
      if (docId) {
        await admin.firestore().collection('signupLeads').doc(docId).update({ uid });
      }

      // Create or update users doc with correct uid
      await admin.firestore().collection('users').doc(uid).set({
        uid,
        name,
        email,
        role: 'owner',
        venue: '',
        venues: [],
        subscriptionStatus: 'trial',
      }, { merge: true });

      console.log(`Auth account created for: ${email} uid: ${uid}`);
      res.status(200).json({ success: true, uid });

    } catch (err: any) {
      console.error('createAuthUser error:', err);
      res.status(500).json({ error: err.message || 'Failed to create account' });
    }
  }
);