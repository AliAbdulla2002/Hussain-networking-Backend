const User = require('../models/user');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const signUp = async (req, res) => {
    try {
        const query = [];
        if (req.body.username) query.push({ username: req.body.username });
        if (req.body.email) query.push({ email: req.body.email });

        if (query.length > 0) {
            const existingUser = await User.findOne({ $or: query });
            if (existingUser) {
                return res.status(400).json({ error: 'Account already exists.' });
            }
        }

        const user = new User(req.body);
        
        if (req.body.password) {
            user.password = bcrypt.hashSync(req.body.password, 10);
        }
        
        const isAdminByEmail = process.env.ADMIN_EMAIL && req.body.email === process.env.ADMIN_EMAIL;
        const isAdminByUsername = process.env.ADMIN_USERNAME && req.body.username === process.env.ADMIN_USERNAME;

        if (isAdminByEmail || isAdminByUsername) {
            user.role = 'Admin';
        } else {
            user.role = req.body.role || 'User';
        }

        user.isBanned = false;

        await user.save();

        const payload = { 
            _id: user._id, 
            username: user.username,
            email: user.email,
            role: user.role, 
            avatar: user.avatar,
            isBanned: user.isBanned 
        };

        const token = jwt.sign({ payload }, process.env.JWT_SECRET);
        res.status(201).json({ token });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

const signIn = async (req, res) => {
    try {
        const identifier = req.body.username || req.body.email;
        
        const user = await User.findOne({ 
            $or: [{ username: identifier }, { email: identifier }] 
        });

        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials.' });
        }

        if (!user.password || !req.body.password) {
            return res.status(401).json({ error: 'Invalid credentials.' });
        }

        const isPasswordCorrect = bcrypt.compareSync(req.body.password, user.password);
        
        if (!isPasswordCorrect) {
            return res.status(401).json({ error: 'Invalid credentials.' });
        }

        const payload = { 
            _id: user._id, 
            username: user.username,
            email: user.email,
            role: user.role, 
            avatar: user.avatar,
            isBanned: user.isBanned 
        };

        const token = jwt.sign({ payload }, process.env.JWT_SECRET);
        res.status(200).json({ token });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

module.exports = { signUp, signIn };