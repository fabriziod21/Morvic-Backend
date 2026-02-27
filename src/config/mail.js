const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.MAIL_USERNAME,
    pass: process.env.MAIL_PASSWORD,
  },
});

async function enviarCorreo(destinatario, asunto, htmlContent) {
  await transporter.sendMail({
    from: process.env.MAIL_USERNAME,
    to: destinatario,
    subject: asunto,
    html: htmlContent,
  });
}

module.exports = { enviarCorreo };
