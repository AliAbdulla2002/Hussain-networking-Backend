const Course = require('../models/course')
const User = require('../models/user')

const checkOwnership = (course, user) => {
    if (user.role === 'Admin') return true;
    if (user.role === 'Instructor' && course.instructor && course.instructor._id.toString() === user._id.toString()) return true;
    return false;
}

const create = async (req, res) => {
    try {
        if (!['Admin', 'Instructor'].includes(req.user.role)) return res.status(403).json({ err: 'Access denied.' })
        
        req.body.instructor = req.user._id
        
        if (req.file) {
            req.body.coverImage = req.file.path || req.file.secure_url || req.file.url;
        }
        
        const course = await Course.create(req.body)
        res.status(201).json(course)

        const Notification = require('../models/notification');
        const allStudents = await User.find({ role: 'User' });
        
        const notificationsToSave = allStudents.map(student => ({
            recipient: student._id,
            type: 'course',
            content: `New course added: ${course.title}`,
            link: `/courses/${course._id}`
        }));

        if (notificationsToSave.length > 0) {
            await Notification.insertMany(notificationsToSave);
            
            allStudents.forEach(student => {
                const socketId = req.connectedUsers?.get(student._id.toString());
                if (socketId) {
                    req.io.to(socketId).emit('new_notification', {
                        _id: Math.random().toString(),
                        type: 'course',
                        content: `New course added: ${course.title}`,
                        link: `/courses/${course._id}`,
                        isRead: false,
                        createdAt: new Date()
                    });
                }
            });
        }
    } catch (err) {
        res.status(500).json({ err: err.message })
    }
}

const show = async (req, res) => {
    try {
        const courseDoc = await Course.findById(req.params.courseId)
            .populate('instructor', 'username email')
            .populate('students', 'username email role')
            .populate('reviews.student', 'username email')
            
        if (!courseDoc) return res.status(404).json({ err: 'Course not found' })
        
        const isOwnerOrAdmin = checkOwnership(courseDoc, req.user);
        const isStaff = ['Admin', 'Instructor'].includes(req.user.role);
        const isEnrolled = courseDoc.students.some(s => s._id.toString() === req.user._id.toString());

        if (courseDoc.isHidden && !isOwnerOrAdmin) {
            return res.status(403).json({ err: 'Course is hidden' })
        }

        const course = courseDoc.toObject();

        if (!isOwnerOrAdmin) {
            course.lessons = course.lessons.filter(l => !l.isHidden);

            if (!isStaff && !isEnrolled && !course.isTrial) {
                course.lessons = course.lessons.map(l => {
                    if (l.isTrial) return l;
                    l.videoUrl = '';
                    l.content = '🔒 This lesson is locked. You must be enrolled to access this content.';
                    l.pdfNotes = '';
                    return l;
                });
            }
        }

        res.status(200).json(course)
    } catch (err) {
        res.status(500).json({ err: err.message })
    }
}

const enrollStudent = async (req, res) => {
    try {
        const course = await Course.findById(req.params.courseId)
        if (!checkOwnership(course, req.user)) return res.status(403).json({ err: 'Access denied.' })
        
        const student = await User.findOne({ email: req.body.email })
        if (!student) return res.status(404).json({ err: 'Student not found.' })
        
        if (course.students.includes(student._id)) return res.status(400).json({ err: 'Already enrolled.' })
        course.students.push(student._id)
        await course.save()
        res.status(200).json({ message: 'Enrolled successfully', course })
    } catch (err) {
        res.status(500).json({ err: err.message })
    }
}

const index = async (req, res) => {
    try {
        let courses;
        if (req.user.role === 'Admin') {
            courses = await Course.find({}).populate('instructor').populate('students', 'email role') 
        } else if (req.user.role === 'Instructor') {
            courses = await Course.find({ instructor: req.user._id }).populate('instructor').populate('students', 'email role')
        } else {
            courses = await Course.find({ isHidden: false }).populate('instructor')
        }
        res.status(200).json(courses)
    } catch (err) {
        res.status(500).json({ err: err.message })
    }
}

const addLesson = async (req, res) => {
    try {
        const course = await Course.findById(req.params.courseId)
        if (!checkOwnership(course, req.user)) return res.status(403).json({ message: "Access denied." })
        
        if (req.file) {
            req.body.pdfNotes = req.file.path || req.file.secure_url || req.file.url;
        }

        course.lessons.push(req.body)
        await course.save()
        res.status(201).json({ message: "Lesson added", course })
    } catch (err) {
        res.status(500).json({ err: err.message })
    }
}

const updateLesson = async (req, res) => {
    try {
        const course = await Course.findById(req.params.courseId);
        if (!checkOwnership(course, req.user)) return res.status(403).json({ message: "Access denied." });
        
        const lesson = course.lessons.id(req.params.lessonId);
        if (!lesson) return res.status(404).json({ err: 'Lesson not found' });

        lesson.title = req.body.title || lesson.title;
        lesson.content = req.body.content || lesson.content;
        
        if (req.body.videoUrl !== undefined) {
            lesson.videoUrl = req.body.videoUrl;
        }
        
        if (req.file) {
            lesson.pdfNotes = req.file.path || req.file.secure_url || req.file.url;
        }

        await course.save();
        res.status(200).json({ message: "Lesson updated successfully", course });
    } catch (err) {
        res.status(500).json({ err: err.message });
    }
}

const completeLesson = async (req, res) => {
    try {
        const user = await User.findById(req.user._id)
        const course = await Course.findById(req.params.courseId)
        const lessonId = req.params.lessonId

        if (!user.completedLessons.includes(lessonId)) {
            user.completedLessons.push(lessonId)
        }

        const courseLessonIds = course.lessons.filter(l => !l.isHidden).map(l => l._id.toString())
        const userCompletedIds = user.completedLessons.map(id => id.toString())
        const isFullyCompleted = courseLessonIds.length > 0 && courseLessonIds.every(id => userCompletedIds.includes(id))

        const hasCertificate = user.certificates.some(cert => cert.course.toString() === course._id.toString())

        if (isFullyCompleted && !hasCertificate) {
            user.certificates.push({
                course: course._id,
                certificateId: `CERT-${Date.now()}`
            })
        }

        await user.save()
        res.status(200).json({ message: "Lesson complete!", completedLessons: user.completedLessons })
    } catch (err) {
        res.status(500).json({ err: err.message })
    }
}

const addReview = async (req, res) => {
    try {
        const course = await Course.findById(req.params.courseId)
        
        const isEnrolled = course.students.includes(req.user._id);
        if (!isEnrolled && !course.isTrial) {
            return res.status(403).json({ err: "You must be enrolled to leave a review." })
        }

        req.body.student = req.user._id
        course.reviews.push(req.body)
        await course.save()
        res.status(201).json({ message: "Review added", course })
    } catch (err) {
        res.status(500).json({ err: err.message })
    }
}

const updateCourse = async (req, res) => {
    try {
        const courseCheck = await Course.findById(req.params.courseId)
        if (!checkOwnership(courseCheck, req.user)) return res.status(403).json({ err: 'Access denied.' })
        
        if (req.file) {
            req.body.coverImage = req.file.path || req.file.secure_url || req.file.url
        }
        
        const course = await Course.findByIdAndUpdate(req.params.courseId, req.body, { new: true })
        res.status(200).json(course)
    } catch (err) {
        res.status(500).json({ err: err.message })
    }
}

const toggleCourseVisibility = async (req, res) => {
    try {
        const course = await Course.findById(req.params.courseId)
        if (!course) return res.status(404).json({ err: 'Course not found' })
        if (!checkOwnership(course, req.user)) return res.status(403).json({ err: 'Access denied.' })

        course.isHidden = !course.isHidden
        await course.save()
        res.status(200).json(course)
    } catch (err) {
        res.status(500).json({ err: err.message })
    }
}

const toggleCourseTrial = async (req, res) => {
    try {
        const course = await Course.findById(req.params.courseId)
        if (!course) return res.status(404).json({ err: 'Course not found' })
        if (!checkOwnership(course, req.user)) return res.status(403).json({ err: 'Access denied.' })

        course.isTrial = !course.isTrial
        await course.save()
        res.status(200).json(course)
    } catch (err) {
        res.status(500).json({ err: err.message })
    }
}

const toggleLessonVisibility = async (req, res) => {
    try {
        const course = await Course.findById(req.params.courseId)
        if (!checkOwnership(course, req.user)) return res.status(403).json({ err: 'Access denied.' })
        
        const lesson = course.lessons.id(req.params.lessonId)
        if (!lesson) return res.status(404).json({ err: 'Lesson not found' })

        lesson.isHidden = !lesson.isHidden
        await course.save()
        res.status(200).json(course)
    } catch (err) {
        res.status(500).json({ err: err.message })
    }
}

const toggleLessonTrial = async (req, res) => {
    try {
        const course = await Course.findById(req.params.courseId)
        if (!checkOwnership(course, req.user)) return res.status(403).json({ err: 'Access denied.' })
        
        const lesson = course.lessons.id(req.params.lessonId)
        if (!lesson) return res.status(404).json({ err: 'Lesson not found' })

        lesson.isTrial = !lesson.isTrial
        await course.save()
        res.status(200).json(course)
    } catch (err) {
        res.status(500).json({ err: err.message })
    }
}

const deleteCourse = async (req, res) => {
    try {
        const courseCheck = await Course.findById(req.params.courseId)
        if (!checkOwnership(courseCheck, req.user)) return res.status(403).json({ err: 'Access denied.' })
        
        const course = await Course.findByIdAndDelete(req.params.courseId)
        res.status(200).json({ message: 'Course deleted successfully', course })
    } catch (err) {
        res.status(500).json({ err: err.message })
    }
}

const deleteLesson = async (req, res) => {
    try {
        const course = await Course.findById(req.params.courseId)
        if (!checkOwnership(course, req.user)) return res.status(403).json({ message: "Access denied." })
        
        course.lessons.pull(req.params.lessonId)
        await course.save()
        
        res.status(200).json({ message: "Lesson deleted successfully", course })
    } catch (err) {
        res.status(500).json({ err: err.message })
    }
}

const unenrollStudent = async (req, res) => {
    try {
        const course = await Course.findById(req.params.courseId)
        if (!checkOwnership(course, req.user)) return res.status(403).json({ err: 'Access denied.' })
        
        course.students.pull(req.params.studentId)
        await course.save()
        
        res.status(200).json({ message: 'Student removed successfully', course })
    } catch (err) {
        res.status(500).json({ err: err.message })
    }
}

const getTrialLessons = async (req, res) => {
    try {
        const courses = await Course.find({ isHidden: false })
            .populate('instructor', 'username');
        
        const trialLessons = [];
        
        courses.forEach(course => {
            course.lessons.forEach(lesson => {
                if (lesson.isTrial && !lesson.isHidden) {
                    trialLessons.push({
                        courseId: course._id,
                        courseTitle: course.title,
                        instructorName: course.instructor?.username,
                        coverImage: course.coverImage,
                        lessonId: lesson._id,
                        lessonTitle: lesson.title,
                        videoUrl: lesson.videoUrl,
                        content: lesson.content
                    });
                }
            });
        });

        res.status(200).json(trialLessons);
    } catch (err) {
        res.status(500).json({ err: err.message });
    }
}

module.exports = { create, show, enrollStudent, index, addLesson, updateLesson, completeLesson, addReview, updateCourse, toggleCourseVisibility, toggleCourseTrial, toggleLessonVisibility, toggleLessonTrial, deleteCourse, deleteLesson, unenrollStudent, getTrialLessons }