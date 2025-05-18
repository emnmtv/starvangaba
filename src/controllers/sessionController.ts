import { Request, Response } from 'express';
import { ActiveSession, Activity } from '../config/database';
import mongoose from 'mongoose';
import { updateUserChallengeProgress } from './challengeController';

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
      // Reset existing session instead of failing
      console.log("Resetting existing session:", existingSession._id);
      
      // Update the session with new data
      existingSession.startTime = new Date();
      existingSession.currentLocation = {
        type: 'Point',
        coordinates: initialLocation.coordinates
      };
      existingSession.currentSpeed = 0;
      existingSession.currentDistance = 0;
      existingSession.currentDuration = 0;
      existingSession.lastUpdated = new Date();
      
      await existingSession.save();
      
      res.status(200).json({
        success: true,
        message: 'Session reset successfully',
        data: existingSession
      });
      return;
    }
    
    console.log("Creating new session with coordinates:", initialLocation.coordinates);
    
    // Create a new session with precise timestamps
    const startTime = new Date();
    const newSession = await ActiveSession.create({
      user: req.user._id,
      startTime: startTime,
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
    
    console.log("New session created:", newSession._id, "at", startTime.toISOString());
    
    res.status(201).json({
      success: true,
      message: 'Session started successfully',
      data: {
        ...newSession.toObject(),
        preciseStartTime: startTime.getTime() // send millisecond timestamp for precise timing
      }
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
      elevation,
      timestamp 
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
    
    // Calculate duration if not provided based on session start time
    let calculatedDuration = duration;
    if (calculatedDuration === undefined) {
      const currentTime = timestamp ? new Date(timestamp) : new Date();
      calculatedDuration = Math.floor((currentTime.getTime() - session.startTime.getTime()) / 1000);
    }
    
    // Update session with new data
    session.currentLocation = {
      type: 'Point',
      coordinates: location.coordinates
    };
    
    if (speed !== undefined) session.currentSpeed = speed;
    if (distance !== undefined) session.currentDistance = distance;
    if (calculatedDuration !== undefined) session.currentDuration = calculatedDuration;
    if (heartRate !== undefined) session.currentHeartRate = heartRate;
    if (elevation !== undefined) session.currentElevation = elevation;
    
    session.lastUpdated = new Date();
    await session.save();
    
    // Send back the complete session with precise timestamps
    res.status(200).json({
      success: true,
      message: 'Session updated successfully',
      data: {
        ...session.toObject(),
        elapsedTime: Math.floor((Date.now() - session.startTime.getTime()) / 1000),
        serverTime: Date.now()
      }
    });

  } catch (error) {
    console.error('Update session error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating session'
    });
  }
};

// Helper function to estimate calories burned based on activity duration
function calculateCalories(durationSeconds: number, user: any, distance: number, activityType: string = 'run'): number {
  // Get the duration in hours
  const durationHours = durationSeconds / 3600;
  
  // Get user metrics with fallbacks to defaults
  const weightKg = user && user.weight ? user.weight : 70; // Default weight if not available
  const heightCm = user && user.height ? user.height : 170; // Default height if not available
  const age = user && user.age ? user.age : 30; // Default age if not available
  const isMale = true; // Default to male if not available - this could be updated later if gender is added to user profile
  
  // Calculate BMR (Basal Metabolic Rate) using the Harris-Benedict equation
  let bmr = 0;
  if (isMale) {
    // For men: BMR = 88.362 + (13.397 × weight in kg) + (4.799 × height in cm) - (5.677 × age in years)
    bmr = 88.362 + (13.397 * weightKg) + (4.799 * heightCm) - (5.677 * age);
  } else {
    // For women: BMR = 447.593 + (9.247 × weight in kg) + (3.098 × height in cm) - (4.330 × age in years)
    bmr = 447.593 + (9.247 * weightKg) + (3.098 * heightCm) - (4.330 * age);
  }
  
  // Calories burned per hour at rest (BMR per day / 24)
  const caloriesPerHourAtRest = bmr / 24;
  
  // Get MET (Metabolic Equivalent of Task) based on activity type and intensity
  let met = 0;
  switch (activityType) {
    case 'run':
      // Adjust MET based on speed (assuming average speed in km/h)
      const speedKmh = distance / 1000 / durationHours;
      if (speedKmh < 8) met = 6; // Jogging/slow running
      else if (speedKmh < 11) met = 9; // Moderate running
      else if (speedKmh < 14) met = 12; // Fast running
      else met = 14; // Very fast running
      break;
    case 'jog':
      met = 7;
      break;
    case 'walk':
      // Adjust MET based on walking speed
      const walkSpeedKmh = distance / 1000 / durationHours;
      if (walkSpeedKmh < 4) met = 3; // Slow walking
      else if (walkSpeedKmh < 6) met = 4; // Moderate walking
      else met = 5; // Fast walking
      break;
    case 'cycling':
      const cycleSpeedKmh = distance / 1000 / durationHours;
      if (cycleSpeedKmh < 16) met = 5; // Leisure cycling
      else if (cycleSpeedKmh < 22) met = 7; // Moderate cycling
      else met = 10; // Vigorous cycling
      break;
    case 'hiking':
      met = 6;
      break;
    default:
      met = 5; // Default to moderate activity
  }
  
  // Age adjustment for MET values
  if (age > 50) {
    met *= 0.95; // 5% reduction for ages over 50
  } else if (age > 65) {
    met *= 0.9; // 10% reduction for ages over 65
  }
  
  // Calculate calories burned during activity
  // Formula: MET × weight (kg) × duration (hours)
  // This is adjusted by BMR to avoid double counting resting calories
  const activityCalories = met * weightKg * durationHours;
  
  return Math.round(activityCalories);
}

// Calculate steps based on distance, user height, and activity type
function calculateSteps(distanceMeters: number, user: any, activityType: string = 'run'): number {
  // Default values if user info isn't available
  const heightCm = user && user.height ? user.height : 170;
  
  // Calculate stride length based on height and activity type
  let strideLength = 0;
  
  switch (activityType) {
    case 'run':
      // Running stride is typically longer (about 45% of height)
      strideLength = heightCm * 0.45;
      break;
    case 'jog':
      // Jogging stride (about 40% of height)
      strideLength = heightCm * 0.4;
      break;
    case 'walk':
      // Walking stride (about 42% of height for men, 41% for women)
      // We'll use an average of 41.5% for now
      strideLength = heightCm * 0.415;
      break;
    case 'hiking':
      // Hiking stride (slightly shorter than walking due to terrain)
      strideLength = heightCm * 0.4;
      break;
    default:
      // Default to walking stride
      strideLength = heightCm * 0.415;
  }
  
  // Convert stride length to meters
  const strideLengthMeters = strideLength / 100;
  
  // Calculate steps: distance / stride length
  const steps = Math.round(distanceMeters / strideLengthMeters);
  
  return steps;
}

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
      route,
      simulated
    } = req.body;
    
    console.log("Stop session request data:", {
      totalDistance,
      totalDuration,
      finalLocation,
      simulated
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
    let finalDistance = typeof totalDistance === 'number' && totalDistance > 0 
      ? totalDistance 
      : session.currentDistance > 0 
        ? session.currentDistance 
        : 0.001; // Minimal fallback value to satisfy validation
    
    // Check if the distance is likely in kilometers rather than meters
    if (finalDistance > 0 && finalDistance < 100) {
      console.log(`Converting distance from km to meters: ${finalDistance} km → ${finalDistance * 1000} meters`);
      finalDistance = finalDistance * 1000; // Convert to meters for storage
    }
    
    // Ensure duration is valid
    const finalDuration = typeof totalDuration === 'number' && totalDuration > 0
      ? totalDuration
      : session.currentDuration > 0
        ? session.currentDuration
        : 1; // Minimal fallback value
    
    console.log("Creating activity with distance:", finalDistance, "duration:", finalDuration, "simulated:", simulated);
    
    const activityTypeValue = activityType || 'run';
    
    // Calculate calories and steps
    const caloriesBurned = calculateCalories(finalDuration, req.user, finalDistance, activityTypeValue);
    const stepsTaken = calculateSteps(finalDistance, req.user, activityTypeValue);
    
    // Create a new activity from this session
    const activity = await Activity.create({
      user: req.user._id,
      type: activityTypeValue,
      title: title || `Activity on ${new Date().toLocaleDateString()}`,
      startTime: session.startTime,
      endTime: new Date(),
      duration: finalDuration,
      distance: finalDistance,
      elevationGain: elevationGain || 0,
      averageSpeed: averageSpeed || (finalDistance / (finalDuration / 3600)), // m/s
      maxSpeed: maxSpeed || session.currentSpeed || 0,
      averagePace: finalDuration / (finalDistance / 1000), // seconds per km
      calories: caloriesBurned,
      steps: stepsTaken,
      simulated: simulated === true, // Set simulated flag, default to false if not provided
      route: {
        type: 'LineString',
        coordinates: routeCoordinates
      },
      locationHistory: processedHistory,
      privacy: 'public'
    });
    
    // Update user's total distance
    try {
      // Use findOneAndUpdate to atomically update the totalDistance field
      // Add the activity distance to the existing totalDistance
      await mongoose.model('User').findByIdAndUpdate(
        req.user._id,
        { $inc: { totalDistance: finalDistance } }
      );
      
      console.log(`Updated user's total distance by adding: ${finalDistance} meters`);
    } catch (updateError) {
      console.error('Error updating user total distance:', updateError);
      // Continue even if the user total distance update fails
    }
    
    // Mark session as inactive
    session.isActive = false;
    await session.save();
    
    // Update user challenge progress with the complete activity object
    await updateUserChallengeProgress(req.user._id.toString(), activity);
    
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