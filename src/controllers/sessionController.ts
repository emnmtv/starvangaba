import { Request, Response } from 'express';
import { ActiveSession, Activity } from '../config/database';

// Define types for location data
interface LocationPoint {
  timestamp: Date;
  coordinates: number[];
  speed?: number;
  elevation?: number;
  heartRate?: number;
}

// Start a new activity tracking session
export const startSession = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
      return;
    }

    console.log("Starting session with request body:", req.body);
    const { initialLocation, activityType } = req.body;
    
    // Enhanced input validation
    if (!initialLocation) {
      res.status(400).json({
        success: false,
        message: 'Initial location is required'
      });
      return;
    }
    
    if (!initialLocation.coordinates || 
        !Array.isArray(initialLocation.coordinates) || 
        initialLocation.coordinates.length !== 2 ||
        typeof initialLocation.coordinates[0] !== 'number' ||
        typeof initialLocation.coordinates[1] !== 'number') {
      console.error("Invalid coordinates format:", initialLocation);
      res.status(400).json({
        success: false,
        message: 'Invalid location coordinates. Format should be [longitude, latitude] as numbers'
      });
      return;
    }
    
    // Add bounds checking for coordinates
    const [lng, lat] = initialLocation.coordinates;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      console.error("Coordinates out of bounds:", { lng, lat });
      res.status(400).json({
        success: false,
        message: 'Coordinates out of bounds. Latitude must be between -90 and 90, longitude between -180 and 180'
      });
      return;
    }
    
    // Check if there's an active session already
    const existingSession = await ActiveSession.findOne({ 
      user: req.user._id, 
      isActive: true 
    });
    
    if (existingSession) {
      res.status(400).json({
        success: false,
        message: 'You already have an active session',
        data: existingSession
      });
      return;
    }
    
    console.log("Creating new session with coordinates:", initialLocation.coordinates);
    
    // Create a new session
    const newSession = await ActiveSession.create({
      user: req.user._id,
      startTime: new Date(),
      isActive: true,
      currentLocation: {
        type: 'Point',
        coordinates: initialLocation.coordinates
      },
      currentSpeed: 0,
      currentDistance: 0,
      currentDuration: 0,
      lastUpdated: new Date()
    });
    
    console.log("New session created:", newSession._id);
    
    res.status(201).json({
      success: true,
      message: 'Session started successfully',
      data: newSession
    });

  } catch (error) {
    console.error('Start session error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while starting session: ' + (error instanceof Error ? error.message : String(error))
    });
  }
};

// Update session with current location and stats
export const updateSession = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
      return;
    }

    const { 
      location, 
      speed, 
      distance, 
      duration, 
      heartRate, 
      elevation 
    } = req.body;
    
    // Validate input
    if (!location || !location.coordinates) {
      res.status(400).json({
        success: false,
        message: 'Current location is required'
      });
      return;
    }
    
    // Find active session
    const session = await ActiveSession.findOne({ 
      user: req.user._id, 
      isActive: true 
    });
    
    if (!session) {
      res.status(404).json({
        success: false,
        message: 'No active session found'
      });
      return;
    }
    
    // Update session with new data
    session.currentLocation = {
      type: 'Point',
      coordinates: location.coordinates
    };
    
    if (speed !== undefined) session.currentSpeed = speed;
    if (distance !== undefined) session.currentDistance = distance;
    if (duration !== undefined) session.currentDuration = duration;
    if (heartRate !== undefined) session.currentHeartRate = heartRate;
    if (elevation !== undefined) session.currentElevation = elevation;
    
    session.lastUpdated = new Date();
    await session.save();
    
    res.status(200).json({
      success: true,
      message: 'Session updated successfully',
      data: session
    });

  } catch (error) {
    console.error('Update session error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating session'
    });
  }
};

// Stop an active session and create an activity from it
export const stopSession = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
      return;
    }

    const { 
      finalLocation,
      locationHistory,
      totalDistance,
      totalDuration,
      title,
      activityType,
      elevationGain,
      averageSpeed,
      maxSpeed,
      route
    } = req.body;
    
    console.log("Stop session request data:", {
      totalDistance,
      totalDuration,
      finalLocation
    });
    
    // Find active session
    const session = await ActiveSession.findOne({ 
      user: req.user._id, 
      isActive: true 
    });
    
    if (!session) {
      res.status(404).json({
        success: false,
        message: 'No active session found'
      });
      return;
    }
    
    // Process location history for route creation
    let processedHistory = locationHistory || [{
      timestamp: new Date(),
      location: session.currentLocation,
      speed: session.currentSpeed,
      elevation: session.currentElevation,
      heartRate: session.currentHeartRate
    }];
    
    // Create route from location history or use provided route
    let routeCoordinates;
    
    if (route && route.coordinates && route.coordinates.length >= 2) {
      // Use the provided route if it has at least 2 distinct points
      routeCoordinates = route.coordinates;
    } else if (processedHistory.length >= 2) {
      // Use location history to create route
      routeCoordinates = processedHistory.map((loc: LocationPoint) => loc.coordinates);
    } else {
      // If we don't have enough points, create at least 2 distinct points for GeoJSON validity
      // Use current location and offset it slightly for the second point
      const current = session.currentLocation.coordinates;
      routeCoordinates = [
        current,
        [current[0] + 0.0001, current[1] + 0.0001]  // Small offset to create distinct second point
      ];
    }
    
    // Ensure route coordinates are distinct (MongoDB requires at least 2 distinct vertices)
    if (routeCoordinates.length > 1) {
      const distinctCoords = [];
      let lastCoord = null;
      
      for (const coord of routeCoordinates) {
        // Only add if different from previous point
        if (!lastCoord || coord[0] !== lastCoord[0] || coord[1] !== lastCoord[1]) {
          distinctCoords.push(coord);
          lastCoord = coord;
        }
      }
      
      // If after removing duplicates we have fewer than 2 points, add a small offset
      if (distinctCoords.length < 2) {
        distinctCoords.push([
          distinctCoords[0][0] + 0.0001, 
          distinctCoords[0][1] + 0.0001
        ]);
      }
      
      routeCoordinates = distinctCoords;
    }
    
    // Ensure distance is valid (required field that cannot be null or 0)
    const finalDistance = typeof totalDistance === 'number' && totalDistance > 0 
      ? totalDistance 
      : session.currentDistance > 0 
        ? session.currentDistance 
        : 0.001; // Minimal fallback value to satisfy validation
    
    // Ensure duration is valid
    const finalDuration = typeof totalDuration === 'number' && totalDuration > 0
      ? totalDuration
      : session.currentDuration > 0
        ? session.currentDuration
        : 1; // Minimal fallback value
    
    console.log("Creating activity with distance:", finalDistance, "duration:", finalDuration);
    
    // Create a new activity from this session
    const activity = await Activity.create({
      user: req.user._id,
      type: activityType || 'run',
      title: title || `Activity on ${new Date().toLocaleDateString()}`,
      startTime: session.startTime,
      endTime: new Date(),
      duration: finalDuration,
      distance: finalDistance,
      elevationGain: elevationGain || 0,
      averageSpeed: averageSpeed || (finalDistance / (finalDuration / 3600)), // m/s
      maxSpeed: maxSpeed || session.currentSpeed || 0,
      averagePace: finalDuration / (finalDistance / 1000), // seconds per km
      calories: calculateCalories(finalDuration, req.user),
      route: {
        type: 'LineString',
        coordinates: routeCoordinates
      },
      locationHistory: processedHistory,
      privacy: 'public'
    });
    
    // Mark session as inactive
    session.isActive = false;
    await session.save();
    
    res.status(200).json({
      success: true,
      message: 'Session completed and activity saved',
      data: {
        session,
        activity
      }
    });

  } catch (error) {
    console.error('Stop session error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while stopping session: ' + (error instanceof Error ? error.message : String(error))
    });
  }
};

// Get current active session
export const getActiveSession = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
      return;
    }
    
    const session = await ActiveSession.findOne({ 
      user: req.user._id, 
      isActive: true 
    });
    
    if (!session) {
      res.status(404).json({
        success: false,
        message: 'No active session found'
      });
      return;
    }
    
    res.status(200).json({
      success: true,
      data: session
    });

  } catch (error) {
    console.error('Get active session error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching active session'
    });
  }
};

// Helper function to estimate calories burned based on activity duration
function calculateCalories(durationSeconds: number, user: any): number {
  // Very basic estimation - in a real app, would use weight, height, age, gender, heart rate
  const durationHours = durationSeconds / 3600;
  const averageMET = 7; // Metabolic Equivalent of Task for running
  const weightKg = 70; // Default weight if not available
  
  // Calories = MET × weight (kg) × duration (hours)
  return Math.round(averageMET * weightKg * durationHours);
}

// Reset any active sessions for a user
export const resetSession = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
      return;
    }

    console.log(`Attempting to reset sessions for user: ${req.user._id}`);

    // Find all active sessions for this user
    const activeSessions = await ActiveSession.find({ 
      user: req.user._id, 
      isActive: true 
    });

    if (activeSessions.length === 0) {
      res.status(200).json({
        success: true,
        message: 'No active sessions found to reset',
        count: 0
      });
      return;
    }

    // Mark all sessions as inactive
    const result = await ActiveSession.updateMany(
      { user: req.user._id, isActive: true },
      { isActive: false }
    );

    console.log(`Reset ${result.modifiedCount} active sessions for user: ${req.user._id}`);
    
    res.status(200).json({
      success: true,
      message: `Successfully reset ${result.modifiedCount} active sessions`,
      count: result.modifiedCount
    });

  } catch (error) {
    console.error('Reset session error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while resetting sessions: ' + (error instanceof Error ? error.message : String(error))
    });
  }
}; 