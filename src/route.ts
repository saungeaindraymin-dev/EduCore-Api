import { Router } from 'express';
import authRoutes from '@/modules/auth/auth.routes';
import usersRoutes from '@/modules/users/users.routes';
import coursesRoutes from '@/modules/courses/courses.routes';
import enrollmentsRoutes from '@/modules/enrollments/enrollments.routes';
import studentsRoutes from '@/modules/students/students.routes';
import assignmentsRoutes from '@/modules/assignments/assignments.routes';
import quizzesRoutes from '@/modules/quizzes/quizzes.routes';
import submissionsRoutes from '@/modules/assignments/submissions.routes';
import dashboardRoutes from '@/modules/dashboard/dashboard.routes';
import scheduleRoutes from '@/modules/schedule/schedule.routes';
import announcementsRoutes from '@/modules/announcements/announcements.routes';
import accessRoutes from '@/modules/access/access.routes';

const api = Router();

api.get('/health', (_req, res) => res.json({ status: 'ok', ts: Date.now() }));
api.use('/auth', authRoutes);
api.use('/users', usersRoutes);
api.use('/courses', coursesRoutes);
api.use('/enrollments', enrollmentsRoutes);
api.use('/students', studentsRoutes);
api.use('/assignments', assignmentsRoutes);
api.use('/quizzes', quizzesRoutes);
api.use('/submissions', submissionsRoutes);
api.use('/dashboard', dashboardRoutes);
api.use('/schedule', scheduleRoutes);
api.use('/announcements', announcementsRoutes);
api.use('/me', accessRoutes);

export default api;