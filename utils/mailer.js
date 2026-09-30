const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

const sendNotificationEmail = async (receiverEmail, senderName) => {
    try {
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: receiverEmail,
            subject: '🔔 You have a new message on EdTech Platform!',
            html: `
                <div style="font-family: Arial, sans-serif; text-align: center; padding: 20px;">
                    <h2 style="color: #E53E3E;">New Message!</h2>
                    <p>Hello,</p>
                    <p><strong>${senderName}</strong> sent you a new message on the platform.</p>
                    <a href="${process.env.FRONTEND_URL}/messages" style="display: inline-block; padding: 10px 20px; background-color: #E53E3E; color: white; text-decoration: none; border-radius: 5px; margin-top: 15px;">
                        Click here to reply
                    </a>
                </div>
            `
        };

        await transporter.sendMail(mailOptions);
        console.log(`Email sent to ${receiverEmail}`);
    } catch (error) {
        console.error('Error sending email:', error);
    }
};

module.exports = { sendNotificationEmail };