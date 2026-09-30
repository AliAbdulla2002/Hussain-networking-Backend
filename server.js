const dns = require("node:dns");
dns.setServers(["8.8.8.8", "1.1.1.1"]);

const dotenv = require('dotenv').config();
const express = require('express');
const app = express();
const mongoose = require('mongoose');
const cors = require('cors');
const morgan = require('morgan');

const http = require('http');
const { Server } = require('socket.io');
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"]
  }
});

const PORT = process.env.PORT ? process.env.PORT : "3000";

const authCtrl = require('./controllers/auth');
const usersCtrl = require('./controllers/users');
const coursesCtrl = require('./controllers/courses');
const adminCtrl = require('./controllers/admin');
const chatCtrl = require('./controllers/chat');
const notifCtrl = require('./controllers/notifications');

const verifyToken = require('./middleware/verify-token');
const upload = require('./middleware/upload');
const Message = require('./models/message');
const User = require('./models/user');
const Notification = require('./models/notification');
const { sendNotificationEmail } = require('./utils/mailer');

mongoose.connect(process.env.MONGODB_URI);

app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

const connectedUsers = new Map();
const onlineStudents = new Set(); 

app.use((req, res, next) => {
  req.io = io;
  req.connectedUsers = connectedUsers;
  req.onlineStudents = onlineStudents;
  next();
});

io.on('connection', (socket) => {
  socket.on('register', async (userId) => {
    connectedUsers.set(userId, socket.id);
    
    try {
      const user = await User.findById(userId);
      if (user) {
        if (user.isBanned) {
            io.to(socket.id).emit('account_banned');
        }
        
        if (user.role === 'User') {
          onlineStudents.add(userId);
        } else {
          onlineStudents.delete(userId);
        }
      }
      io.emit('online_users_update', onlineStudents.size);
    } catch (error) {
      console.error(error);
    }
  });

  socket.on('send_message', async (data) => {
    const { senderId, receiverId, content, attachment } = data;

    try {
      const newMessage = await Message.create({
        sender: senderId,
        receiver: receiverId,
        content: content || '',
        attachment: attachment || null
      });

      const sender = await User.findById(senderId);
      const senderName = sender.username || sender.email.split('@')[0];

      const newNotif = await Notification.create({
        recipient: receiverId,
        type: 'message',
        content: `New message from ${senderName}`,
        link: '/messages'
      });

      const receiverSocketId = connectedUsers.get(receiverId);
      if (receiverSocketId) {
        io.to(receiverSocketId).emit('receive_message', newMessage);
        io.to(receiverSocketId).emit('new_notification', newNotif);
      } else {
        const receiver = await User.findById(receiverId);
        if (receiver && sender) {
          await sendNotificationEmail(receiver.email, senderName);
        }
      }
    } catch (error) {
      console.error(error);
    }
  });

  socket.on('disconnect', () => {
    let disconnectedUserId = null;
    for (let [userId, socketId] of connectedUsers.entries()) {
      if (socketId === socket.id) {
        disconnectedUserId = userId;
        connectedUsers.delete(userId);
        break;
      }
    }
    
    if (disconnectedUserId) {
        onlineStudents.delete(disconnectedUserId);
        io.emit('online_users_update', onlineStudents.size);
    }
  });
}); 

app.get('/', (req, res) => { res.send('Hello EdTech API!') });

app.post('/auth/sign-up', authCtrl.signUp);
app.post('/auth/sign-in', authCtrl.signIn);

app.get('/users', verifyToken, usersCtrl.index);
app.get('/users/profile', verifyToken, usersCtrl.getProfile);
app.put('/users/profile', verifyToken, upload.single('avatar'), usersCtrl.updateProfile);

app.get('/admin/stats', verifyToken, adminCtrl.getDashboardStats);
app.get('/admin/students', verifyToken, adminCtrl.getStudents);
app.put('/admin/students/:id/ban', verifyToken, adminCtrl.toggleBanStudent);
app.delete('/admin/students/:id', verifyToken, adminCtrl.deleteStudent);
app.put('/admin/users/:id/role', verifyToken, adminCtrl.changeUserRole);

app.get('/admin/permissions', adminCtrl.getPermissions);
app.put('/admin/permissions', verifyToken, adminCtrl.updatePermissions);

app.get('/courses/trials', coursesCtrl.getTrialLessons);

app.post('/courses', verifyToken, upload.single('coverImage'), coursesCtrl.create);
app.get('/courses', verifyToken, coursesCtrl.index);
app.get('/courses/:courseId', verifyToken, coursesCtrl.show);
app.post('/courses/:courseId/enroll', verifyToken, coursesCtrl.enrollStudent);
app.post('/courses/:courseId/lessons', verifyToken, upload.single('pdfNotes'), coursesCtrl.addLesson);
app.post('/courses/:courseId/lessons/:lessonId/complete', verifyToken, coursesCtrl.completeLesson);
app.post('/courses/:courseId/reviews', verifyToken, coursesCtrl.addReview);
app.put('/courses/:courseId', verifyToken, upload.single('coverImage'), coursesCtrl.updateCourse);

app.patch('/courses/:courseId/toggle-visibility', verifyToken, coursesCtrl.toggleCourseVisibility);
app.patch('/courses/:courseId/toggle-trial', verifyToken, coursesCtrl.toggleCourseTrial);
app.patch('/courses/:courseId/lessons/:lessonId/toggle-visibility', verifyToken, coursesCtrl.toggleLessonVisibility);
app.patch('/courses/:courseId/lessons/:lessonId/toggle-trial', verifyToken, coursesCtrl.toggleLessonTrial);

app.delete('/courses/:courseId', verifyToken, coursesCtrl.deleteCourse);
app.delete('/courses/:courseId/lessons/:lessonId', verifyToken, coursesCtrl.deleteLesson);
app.delete('/courses/:courseId/students/:studentId', verifyToken, coursesCtrl.unenrollStudent);

app.get('/chat/users', verifyToken, chatCtrl.getUsers);
app.get('/chat/:userId', verifyToken, chatCtrl.getMessages);
app.post('/chat/upload', verifyToken, upload.single('attachment'), chatCtrl.uploadAttachment);

app.get('/notifications', verifyToken, notifCtrl.index);
app.put('/notifications/:id/read', verifyToken, notifCtrl.markAsRead);
app.put('/notifications/read-all', verifyToken, notifCtrl.markAllAsRead);
app.delete('/notifications', verifyToken, notifCtrl.clearAll);

server.listen(PORT, () => {
  console.log(`The express app is ready on port ${PORT}`);
});