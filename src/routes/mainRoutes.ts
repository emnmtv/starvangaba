import express from 'express';
import { registerUser, loginUser, updateUserProfile, updateProfilePicture, adminLogin } from '../controllers/mainFunctionController';
import { 
  generateRouteNearUser, 
  saveRoute, 
  getUserRoutes, 
  getRoutesNearLocation,
  getRouteById,
  verifyRoute,
  adminCreateRoute,
  getPendingRoutes,
  getAllRoutes,
  userCreateRoute
} from '../controllers/routeController';
import { 
  startSession,
  updateSession,
  stopSession,
  getActiveSession,
  resetSession
} from '../controllers/sessionController';
import {
  getUserActivities,
  getActivityById
} from '../controllers/activityController';
import { authenticateToken, isAdmin } from '../middleware/authMiddleware';
import { uploadProfilePicture } from '../middleware/fileHandler';

const router = express.Router();

// User registration route
router.post('/register', registerUser);

// Authentication routes
router.post('/login', loginUser);
router.post('/admin/login', adminLogin);

// User profile routes
router.get('/profile', authenticateToken, (req, res) => {
  // Forward request to profile controller
  // Since we're already using req.user from authenticateToken, we can just return that data
  res.status(200).json({
    success: true,
    data: req.user
  });
});
router.put('/profile', authenticateToken, updateUserProfile);
// Add the new profile picture upload route
router.post('/profile/picture', authenticateToken, uploadProfilePicture, updateProfilePicture);

// Route generation and management
router.post('/generate-route', authenticateToken, generateRouteNearUser);
router.post('/routes', authenticateToken, saveRoute);
router.get('/routes', authenticateToken, getUserRoutes);
router. get('/routes/nearby', getRoutesNearLocation);
router.get('/routes/:id', authenticateToken, getRouteById);

// Admin route endpoints
router.get('/admin/routes/pending', authenticateToken, isAdmin, getPendingRoutes);
router.get('/admin/routes/all', authenticateToken, isAdmin, getAllRoutes);
router.post('/admin/routes/verify/:routeId', authenticateToken, isAdmin, verifyRoute);
router.post('/admin/routes/create', authenticateToken, isAdmin, adminCreateRoute);

// Activity routes
router.get('/activities', authenticateToken, getUserActivities);
router.get('/activities/:id', authenticateToken, getActivityById);

// Session tracking routes
router.post('/sessions/start', authenticateToken, startSession);
router.put('/sessions/update', authenticateToken, updateSession);
router.post('/sessions/stop', authenticateToken, stopSession);
router.get('/sessions/active', authenticateToken, getActiveSession);
router.post('/sessions/reset', authenticateToken, resetSession);

// Add the route endpoint for regular users to create routes manually
router.post('/routes/create', authenticateToken, userCreateRoute);

export default router; 