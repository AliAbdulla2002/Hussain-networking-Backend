const mongoose = require('mongoose')

const lessonSchema = new mongoose.Schema({
    title: { type: String, required: true },
    videoUrl: { type: String },
    content: { type: String },
    pdfNotes: { type: String },
    isHidden: { type: Boolean, default: false },
    isTrial: { type: Boolean, default: false }
}, { timestamps: true })

const reviewSchema = new mongoose.Schema({
    student: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        required: true 
    },
    rating: { 
        type: Number, 
        required: true, 
        min: 1, 
        max: 5 
    },
    comment: { type: String }
}, { timestamps: true })

const courseSchema = new mongoose.Schema({
    title: { type: String, required: true },
    description: { type: String, required: true },
    coverImage: { type: String },
    isHidden: { type: Boolean, default: false },
    isTrial: { type: Boolean, default: false },
    instructor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    students: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    lessons: [lessonSchema],
    reviews: [reviewSchema] 
}, { timestamps: true })

const Course = mongoose.model('Course', courseSchema)
module.exports = Course