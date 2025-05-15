import express from 'express';
import { registerUser, loginUser, updateUserProfile } from '../controllers/mainFunctionController';
import { 
  generateRouteNearUser, 
  saveRoute, 
  getUserRoutes, 
  getRoutesNearLocation,
  getRouteById
} from '../controllers/routeController';
import { 
  startSession,
  updateSession,
  stopSession,
  getActiveSession,
  resetSession
} from '../controllers/sessionController';
import { authenticateToken } from '../middleware/authMiddleware';

const router = express.Router();

// User registration route
router.post('/register', registerUser);

// Authentication routes
router.post('/login', loginUser);

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

// Route generation and management
router.post('/generate-route', authenticateToken, generateRouteNearUser);
router.post('/routes', authenticateToken, saveRoute);
router.get('/routes', authenticateToken, getUserRoutes);
router. get('/routes/nearby', getRoutesNearLocation);
router.get('/routes/:id', authenticateToken, getRouteById);

// Session tracking routes
router.post('/sessions/start', authenticateToken, startSession);
router.put('/sessions/update', authenticateToken, updateSession);
router.post('/sessions/stop', authenticateToken, stopSession);
router.get('/sessions/active', authenticateToken, getActiveSession);
router.post('/sessions/reset', authenticateToken, resetSession);

export default router; 