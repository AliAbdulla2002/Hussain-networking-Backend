const User = require('../models/user');
const Course = require('../models/course');
const Notification = require('../models/notification');

let platformPermissions = {
    Instructor: {
        canCreateCourse: true,
        canBanStudents: false
    }
};

const getPermissions = (req, res) => {
    res.status(200).json(platformPermissions);
};

const updatePermissions = (req, res) => {
    if (req.user.role !== 'Admin') return res.status(403).json({ error: 'Access denied.' });
    
    platformPermissions = req.body;
    
    if (req.io) {
        req.io.emit('permissions_updated', platformPermissions);
    }
    
    res.status(200).json(platformPermissions);
};

const getDashboardStats = async (req, res) => {
    try {
        let totalStudents = 0;
        let totalInstructors = 0;
        let totalCourses = 0;
        let totalEnrollments = 0;
        let onlineCount = req.onlineStudents ? req.onlineStudents.size : 0;

        if (req.user.role === 'Admin') {
            totalStudents = await User.countDocuments({ role: 'User' });
            totalInstructors = await User.countDocuments({ role: 'Instructor' });
            totalCourses = await Course.countDocuments();
            
            const courses = await Course.find();
            const allValidStudents = await User.find({ role: 'User' }).select('_id');
            const validIds = allValidStudents.map(s => s._id.toString());
            
            courses.forEach(c => {
                if (c.students) {
                    const enrolled = c.students.filter(sId => validIds.includes(sId.toString()));
                    totalEnrollments += enrolled.length;
                }
            });
        } else if (req.user.role === 'Instructor') {
            const myCourses = await Course.find({ instructor: req.user._id });
            totalCourses = myCourses.length;
            
            const myStudentIds = new Set();
            const allValidStudents = await User.find({ role: 'User' }).select('_id');
            const validIds = allValidStudents.map(s => s._id.toString());
            
            myCourses.forEach(c => {
                if (c.students) {
                    const enrolled = c.students.filter(sId => validIds.includes(sId.toString()));
                    totalEnrollments += enrolled.length;
                    enrolled.forEach(id => myStudentIds.add(id.toString()));
                }
            });
            totalStudents = myStudentIds.size;
            totalInstructors = 0;
        }

        res.status(200).json({ totalStudents, totalInstructors, totalCourses, totalEnrollments, onlineCount });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const getStudents = async (req, res) => {
    try {
        if (req.user.role === 'Admin') {
            const users = await User.find().select('-hashedPassword -password');
            const usersData = users.map(u => {
                const isOnline = req.onlineStudents && req.onlineStudents.has(u._id.toString());
                return { ...u.toObject(), isOnline };
            });
            res.status(200).json(usersData);
        } else if (req.user.role === 'Instructor') {
            const myCourses = await Course.find({ instructor: req.user._id });
            const myStudentIds = new Set();
            myCourses.forEach(c => {
                if (c.students) {
                    c.students.forEach(id => myStudentIds.add(id.toString()));
                }
            });
            
            const students = await User.find({ _id: { $in: Array.from(myStudentIds) }, role: 'User' }).select('-hashedPassword -password');
            const studentsData = students.map(u => {
                const isOnline = req.onlineStudents && req.onlineStudents.has(u._id.toString());
                return { ...u.toObject(), isOnline };
            });
            res.status(200).json(studentsData);
        } else {
            res.status(403).json({ error: 'Access denied' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const toggleBanStudent = async (req, res) => {
    try {
        const student = await User.findById(req.params.id);
        
        if (req.user.role === 'Instructor' && ['Admin', 'Instructor'].includes(student.role)) {
            return res.status(403).json({ error: 'You do not have permission to ban this user.' });
        }

        student.isBanned = !student.isBanned;
        await student.save();

        if (req.connectedUsers && req.io) {
            const socketId = req.connectedUsers.get(student._id.toString());
            if (socketId) {
                if (student.isBanned) {
                    req.io.to(socketId).emit('account_banned');
                } else {
                    req.io.to(socketId).emit('account_unbanned');
                }
            }
        }

        res.status(200).json(student);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const deleteStudent = async (req, res) => {
    try {
        if (req.user.role !== 'Admin') {
            return res.status(403).json({ error: 'Only Admins can delete accounts.' });
        }

        const studentId = req.params.id;
        await User.findByIdAndDelete(studentId);

        await Course.updateMany(
            { students: studentId },
            { $pull: { students: studentId } }
        );

        if (req.connectedUsers && req.io) {
            const socketId = req.connectedUsers.get(studentId);
            if (socketId) {
                req.io.to(socketId).emit('account_deleted');
            }
        }

        res.status(200).json({ message: 'Student deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

const changeUserRole = async (req, res) => {
    try {
        if (req.user.role !== 'Admin') return res.status(403).json({ error: 'Access denied.' });

        const student = await User.findById(req.params.id);
        student.role = req.body.role;
        await student.save();

        if (student.role !== 'User' && req.onlineStudents) {
            req.onlineStudents.delete(student._id.toString());
        }

        if (req.connectedUsers && req.io) {
            const socketId = req.connectedUsers.get(student._id.toString());
            if (socketId) {
                req.io.to(socketId).emit('role_updated', req.body.role);
            }
            req.io.emit('online_users_update', req.onlineStudents ? req.onlineStudents.size : 0);
        }

        res.status(200).json(student);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

module.exports = { getDashboardStats, getStudents, toggleBanStudent, deleteStudent, changeUserRole, getPermissions, updatePermissions };