const User = require('../models/User');
const { sendMail } = require('../utils/mailer');

function numberedList(items) {
  return `<ol style="margin:8px 0 20px;padding-left:28px">${items.map((item) => `<li style="margin:8px 0;line-height:1.55"><strong>${item}</strong></li>`).join('')}</ol>`;
}

function buildLeadIntroductionEmail(lead = {}) {
  return {
    subject: `Introduction - AnantTattva Private Limited | ${lead.company || 'New Lead'}`,
    html: `<div style="margin:0;background:#f8fafc;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;color:#111827">
      <div style="max-width:920px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:32px;font-size:15px;line-height:1.65">
        <p style="margin:0 0 22px">Dear Sir,</p>
        <p style="margin:0 0 18px"><strong>Greetings from AnantTattva Private Limited!</strong></p>
        <p>It was a pleasure connecting with you.</p>
        <p>We are pleased to introduce AnantTattva Private Limited, India’s leading Government Policy Advocacy organisation, providing specialised 360-degree services related to Circular Economy and Sustainability Policies across more than 70 countries.</p>
        <p>AnantTattva is recognised for facilitating industry-stakeholder interactions with government authorities, including the Ministry of MSME, DCPC, FSSAI, MoEF&amp;CC, NITI Aayog, the Department of Customs, the Ministry of Heavy Industries, the Ministry of Finance and others. We have a widespread network of more than 20,000 industry stakeholders, including trade associations and chambers of commerce. We regularly engage with them to spread awareness of government policy initiatives and support successful implementation, enabling industry and national growth.</p>
        <p style="margin-bottom:6px">Our specialised services include:</p>
        ${numberedList(['EPR End-to-End Compliance, Audit &amp; Regulatory Risk Management', 'Technology-Driven Compliance &amp; Traceability Systems', 'Policy Advocacy &amp; Government Representations', 'Corporate Training &amp; Stakeholder Awareness', 'Sustainable Materials &amp; Circular Supply Chain Management', 'Advanced EPR Services', 'CTO/CTE Compliance', 'ESG Sustainability Alignment', 'Sustainability-Based Business Intelligence &amp; Strategic Advisory', 'EPR Due Diligence for Mergers &amp; Acquisitions, IPOs and Venture Capital'])}
        <p>Global manufacturing policies introduced by governments have shifted the focus of businesses from <strong>traditional production to sustainability-driven manufacturing</strong>. These policies demand stringent compliance for reporting on <strong>waste management, recycling, reuse and reduction</strong>, which is audited by Pollution Control Boards on a real-time basis.</p>
        <p>Accordingly, the management and boards of directors of brand owners, producers and recyclers are restructuring their business models with expert and specialised advisory support for market intelligence, market creation and long-term business sustainability. At AnantTattva, our team of experts has developed advanced advisory tools for organisations interested in inflation-risk management, expansion, diversification and collaboration.</p>
        <h3 style="margin:24px 0 8px;font-size:17px;text-decoration:underline">1. Sustainability-Based Market Intelligence for Market Creation</h3>
        ${numberedList(['Data Analysis Tools for Current Models', 'Business Intelligence for Potential Markets &amp; Products', 'Market Creation for Sustainable Products and Competitive Advantage'])}
        <h3 style="margin:24px 0 8px;font-size:17px;text-decoration:underline">2. Business Advisory in the Sustainability Era</h3>
        ${numberedList(['Forward &amp; Backward Integration', 'Diversification', 'Government &amp; Private Collaboration', 'Mergers &amp; Acquisitions'])}
        <p>With our network of more than 20,000 stakeholders and our successful service track record, we are recognised by leading government departments such as Customs, MSME, DCPC and Pollution Control Boards, as well as non-government organisations including FICCI, industry trade associations and chambers of commerce. We are regarded as a preferred partner for creating mass awareness of EPR policy, compliance and audit mandates, and for supporting the development of sustainable material supply-chain ecosystems.</p>
        <p>We are attaching a short brief for your reference and would be pleased to have a detailed discussion to explore the way forward.</p>
        <div style="margin-top:26px;padding-top:18px;border-top:1px solid #e5e7eb;font-size:15px;line-height:1.7;color:#111827">
          <p style="margin:0">Thanks and regards,</p>
          <p style="margin:2px 0 0"><strong>Team AnantTattva Private Limited</strong></p>
        </div>
      </div>
    </div>`
  };
}

async function sendLeadIntroductionEmail({ lead, creator }) {
  const admins = await User.find({ role: { $in: ['admin', 'superadmin'] }, isActive: { $ne: false }, email: { $ne: '' } }).select('email').lean();
  const recipients = [...new Set(admins.map((user) => String(user.email || '').trim().toLowerCase()).filter(Boolean))];
  if (!recipients.length) return { skipped: true, reason: 'no-admin-recipients' };
  const creatorEmail = String(creator?.email || lead?.createdByEmail || '').trim().toLowerCase();
  const content = buildLeadIntroductionEmail(lead);
  await sendMail(recipients, content.subject, content.html, { branded: false, cc: creatorEmail ? [creatorEmail] : [] });
  return { sent: true, recipients, cc: creatorEmail ? [creatorEmail] : [] };
}

module.exports = { buildLeadIntroductionEmail, sendLeadIntroductionEmail };
