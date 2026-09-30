const User = require('../models/user')
const jwt = require('jsonwebtoken')

const index = async (req, res) => {
    try {
        const users = await User.find({})
        res.json(users)
    } catch (error) {
        res.status(500).json({ error: error.message })
    }
}

const getProfile = async (req, res) => {
    try {
        const user = await User.findById(req.user._id).populate('certificates.course')
        res.status(200).json(user)
    } catch (err) {
        res.status(500).json({ err: err.message })
    }
}

const updateProfile = async (req, res) => {
    try {
        const user = await User.findById(req.user._id)
        
        if (req.body.bio !== undefined) user.bio = req.body.bio
        
        if (req.file) {
            console.log("✅ File Object:", req.file)
            
            const imageUrl = req.file.path || req.file.secure_url || req.file.url;
            
            console.log("🚀 The extracted URL is:", imageUrl)
            user.avatar = imageUrl
        } else {
            console.log("❌ NO FILE RECEIVED from the frontend!")
        }
        
        await user.save()

        const payload = { username: user.username, email: user.email, _id: user._id, role: user.role, avatar: user.avatar }
        const token = jwt.sign({ payload }, process.env.JWT_SECRET)

        res.status(200).json({ user, token })
    } catch (err) {
        res.status(500).json({ err: err.message })
    }
}

module.exports = { index, getProfile, updateProfile }