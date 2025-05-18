import express from 'express';
import {
   registerUser, 
  loginUser,
   updateUserProfile,
    updateProfilePicture, 
    adminLogin,
     updatePrivacySettings,
      addWeightEntry,
       getWeightHistory,
       recalculateUserTotalDistance
       } from '../controllers/mainFunctionController';
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
  userCreateRoute,
  deleteRoute,
  updateRoute
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
  getActivityById,
  getUserStats,
  archiveActivity,
  restoreActivity,
  getArchivedActivities
} from '../controllers/activityController';
import {
  createChallenge,
  getAllChallenges,
  getChallengeById,
  updateChallenge,
  deleteChallenge,
  joinChallenge,
  leaveChallenge,
  getUserChallenges,
  getChallengeLeaderboard
} from '../controllers/challengeController';
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
// Add privacy settings update route
router.put('/profile/privacy', authenticateToken, updatePrivacySettings);

// Weight tracking routes
router.post('/profile/weight', authenticateToken, addWeightEntry);
router.get('/profile/weight/history', authenticateToken, getWeightHistory);

// Distance recalculation route
router.post('/profile/distance/recalculate', authenticateToken, recalculateUserTotalDistance);

// Route generation and management
router.post('/generate-route', authenticateToken, generateRouteNearUser);
router.post('/routes', authenticateToken, saveRoute);
router.get('/routes', authenticateToken, getUserRoutes);
router.get('/routes/nearby', getRoutesNearLocation);
router.get('/routes/:id', authenticateToken, getRouteById);
router.put('/routes/:id', authenticateToken, updateRoute);
router.delete('/routes/:id', authenticateToken, deleteRoute);

// Admin route endpoints
router.get('/admin/routes/pending', authenticateToken, isAdmin, getPendingRoutes);
router.get('/admin/routes/all', authenticateToken, isAdmin, getAllRoutes);
router.post('/admin/routes/verify/:routeId', authenticateToken, isAdmin, verifyRoute);
router.post('/admin/routes/create', authenticateToken, isAdmin, adminCreateRoute);

// Activity routes
router.get('/activities/stats/summary', authenticateToken, getUserStats);
router.get('/activities/archived', authenticateToken, getArchivedActivities);
router.get('/activities/:id', authenticateToken, getActivityById);
router.get('/activities', authenticateToken, getUserActivities);

// Activity archive routes
router.put('/activities/:id/archive', authenticateToken, archiveActivity);
router.put('/activities/:id/restore', authenticateToken, restoreActivity);

// Session tracking routes
router.post('/sessions/start', authenticateToken, startSession);
router.put('/sessions/update', authenticateToken, updateSession);
router.post('/sessions/stop', authenticateToken, stopSession);
router.get('/sessions/active', authenticateToken, getActiveSession);
router.post('/sessions/reset', authenticateToken, resetSession);

// Add the route endpoint for regular users to create routes manually
router.post('/routes/create', authenticateToken, userCreateRoute);

// Challenge routes
// Admin challenge management
router.post('/admin/challenges', authenticateToken, isAdmin, createChallenge);
router.put('/admin/challenges/:id', authenticateToken, isAdmin, updateChallenge);
router.delete('/admin/challenges/:id', authenticateToken, isAdmin, deleteChallenge);
router.get('/admin/challenges/leaderboard/:id', authenticateToken, isAdmin, getChallengeLeaderboard);

// Public challenge endpoints
router.get('/challenges', authenticateToken, getAllChallenges);
router.get('/challenges/:id', authenticateToken, getChallengeById);
router.post('/challenges/:id/join', authenticateToken, joinChallenge);
router.post('/challenges/:id/leave', authenticateToken, leaveChallenge);
router.get('/user/challenges', authenticateToken, getUserChallenges);

export default router; 