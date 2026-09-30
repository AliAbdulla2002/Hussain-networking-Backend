const Notification = require('../models/notification');

const index = async (req, res) => {
    try {
        const notifications = await Notification.find({ recipient: req.user._id })
            .sort({ createdAt: -1 })
            .limit(20);
        res.status(200).json(notifications);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const markAsRead = async (req, res) => {
    try {
        await Notification.findByIdAndUpdate(req.params.id, { isRead: true });
        res.status(200).json({ message: 'Marked as read' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const markAllAsRead = async (req, res) => {
    try {
        await Notification.updateMany({ recipient: req.user._id, isRead: false }, { isRead: true });
        res.status(200).json({ message: 'All marked as read' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const clearAll = async (req, res) => {
    try {
        await Notification.deleteMany({ recipient: req.user._id });
        res.status(200).json({ message: 'All cleared' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

module.exports = { index, markAsRead, markAllAsRead, clearAll };