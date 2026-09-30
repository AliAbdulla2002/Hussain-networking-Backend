const mongoose = require('mongoose')

const userSchema = new mongoose.Schema({
    username: { 
        type: String, 
        required: true,
        unique: true 
    },
    email: {
        type: String,
        required: true,
        unique: true,
    },
    password: {
        type: String,
        required: true,
    },
    role: {
        type: String,
        enum: ['Admin', 'Instructor', 'User'],
        default: 'User'
    },
    avatar: { type: String },
    bio: { type: String },
    completedLessons: [{ type: mongoose.Schema.Types.ObjectId }],
    certificates: [{
        course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course' },
        issueDate: { type: Date, default: Date.now },
        certificateId: { type: String }
    }],
    isBanned: { 
        type: Boolean, 
        default: false 
    }
}, { timestamps: true })

userSchema.set('toJSON', {
    transform: (document, returnedObject) => {
        delete returnedObject.password
    }
})

const User = mongoose.model('User', userSchema)
module.exports = User