import { Request, Response } from 'express';
import { Route } from '../config/database';
import axios from 'axios';
import mongoose from 'mongoose';

interface Point {
  lat: number;
  lng: number;
}

// Calculate distance between two points using Haversine formula
function getDistanceBetweenPoints(p1: Point, p2: Point): number {
  const R = 6371; // Earth's radius in km
  
  const lat1 = p1.lat * Math.PI / 180;
  const lat2 = p2.lat * Math.PI / 180;
  const dLat = (p2.lat - p1.lat) * Math.PI / 180;
  const dLng = (p2.lng - p1.lng) * Math.PI / 180;
  
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1) * Math.cos(lat2) *
            Math.sin(dLng/2) * Math.sin(dLng/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  const distance = R * c;
  
  return distance;
}

// Calculate total distance of a route in km
function calculateTotalDistance(points: Point[]): number {
  let totalDistance = 0;
  
  for (let i = 1; i < points.length; i++) {
    totalDistance += getDistanceBetweenPoints(points[i-1], points[i]);
  }
  
  return parseFloat(totalDistance.toFixed(2));
}

// Helper to generate route waypoints
function generateRoutePoints(
  startLat: number, 
  startLng: number, 
  targetDistance: number, 
  numPoints: number,
  isLoop: boolean
): Point[] {
  // Earth radius in km
  const R = 6371;
  const points: Point[] = [];
  
  // Start point
  points.push({ lat: startLat, lng: startLng });
  
  // Calculate roughly how far each point should be to achieve target distance
  // This is a simplification - actual route will be longer due to non-linear path
  const avgDistancePerStep = targetDistance / (numPoints - 1);
  
  // Generate intermediate points with some randomness
  for (let i = 1; i < numPoints - 1; i++) {
    // Random angle in radians
    const angle = Math.random() * 2 * Math.PI;
    
    // Distance with some randomness (0.5-1.5x the average)
    const stepDistance = avgDistancePerStep * (0.5 + Math.random());
    
    // Calculate new coordinates using bearing formula
    // Distance in km / Earth radius = angular distance in radians
    const angularDistance = stepDistance / R;
    
    // Previous point
    const prevLat = points[i-1].lat * Math.PI / 180;
    const prevLng = points[i-1].lng * Math.PI / 180;
    
    // Calculate new position
    const newLat = Math.asin(
      Math.sin(prevLat) * Math.cos(angularDistance) +
      Math.cos(prevLat) * Math.sin(angularDistance) * Math.cos(angle)
    );
    
    const newLng = prevLng + Math.atan2(
      Math.sin(angle) * Math.sin(angularDistance) * Math.cos(prevLat),
      Math.cos(angularDistance) - Math.sin(prevLat) * Math.sin(newLat)
    );
    
    // Convert to degrees
    points.push({
      lat: newLat * 180 / Math.PI,
      lng: newLng * 180 / Math.PI
    });
  }
  
  // For loop routes, add the start point as end point
  if (isLoop) {
    points.push({ lat: startLat, lng: startLng });
  } else {
    // For non-loop routes, add a final point that's in roughly the same direction
    const lastPoint = points[points.length - 1];
    const secondLastPoint = points[points.length - 2];
    
    // Direction vector
    const dirLat = lastPoint.lat - secondLastPoint.lat;
    const dirLng = lastPoint.lng - secondLastPoint.lng;
    
    // Scale to appropriate distance
    const scale = avgDistancePerStep / Math.sqrt(dirLat * dirLat + dirLng * dirLng) * 0.008; // ~0.008 degrees ≈ 1km
    
    points.push({
      lat: lastPoint.lat + dirLat * scale,
      lng: lastPoint.lng + dirLng * scale
    });
  }
  
  return points;
}

// Format route response in GeoJSON format
function formatRouteResponse(points: Point[], title: string, distance: number, elevation: number): any {
  // Convert to GeoJSON format
  const coordinates = points.map(p => [p.lng, p.lat]); // GeoJSON uses [lng, lat] format
  
  // Start and end points
  const startPoint = {
    type: 'Point',
    coordinates: coordinates[0]
  };
  
  const endPoint = {
    type: 'Point',
    coordinates: coordinates[coordinates.length - 1]
  };
  
  return {
    title: title,
    description: `Generated ${title.toLowerCase()} with distance ${distance}km`,
    distance: distance,
    elevationGain: elevation,
    startPoint: startPoint,
    endPoint: endPoint,
    path: {
      type: 'LineString',
      coordinates: coordinates
    }
  };
}

// Generate waypoints in a rough circular pattern for loop routes
function generateCircularWaypoints(centerLat: number, centerLng: number, radius: number, numPoints: number): Point[] {
  const waypoints: Point[] = [];
  const R = 6371; // Earth radius in km
  
  // Start with the center point
  waypoints.push({ lat: centerLat, lng: centerLng });
  
  // Generate points around a circle
  const actualRadius = radius / (2 * Math.PI) * numPoints; // Scale radius to achieve target distance
  
  for (let i = 0; i < numPoints; i++) {
    const angle = (2 * Math.PI * i) / numPoints;
    
    const pointLat = Math.asin(
      Math.sin(centerLat * Math.PI/180) * Math.cos(actualRadius/R) +
      Math.cos(centerLat * Math.PI/180) * Math.sin(actualRadius/R) * Math.cos(angle)
    ) * 180/Math.PI;
    
    const pointLng = centerLng + Math.atan2(
      Math.sin(angle) * Math.sin(actualRadius/R) * Math.cos(centerLat * Math.PI/180),
      Math.cos(actualRadius/R) - Math.sin(centerLat * Math.PI/180) * Math.sin(pointLat * Math.PI/180)
    ) * 180/Math.PI;
    
    waypoints.push({ lat: pointLat, lng: pointLng });
  }
  
  // Complete the loop by returning to start
  waypoints.push({ lat: centerLat, lng: centerLng });
  
  return waypoints;
}

// Function to generate a short route (2-3km)
function generateShortRoute(lat: number, lng: number, maxDistance: number): any {
  // Limit to shorter distance
  const distance = Math.min(maxDistance, 3);
  
  // Generate points - short route is simpler with fewer points
  const points = generateRoutePoints(lat, lng, distance, 5, false);
  
  // Calculate actual distance
  const routeDistance = calculateTotalDistance(points);
  const elevationGain = Math.round(routeDistance * 8); // Simple elevation model
  
  return formatRouteResponse(points, 'Short Route', routeDistance, elevationGain);
}

// Function to generate a long route (5-10km)
function generateLongRoute(lat: number, lng: number, maxDistance: number): any {
  // Use higher distance for long routes
  const distance = Math.min(maxDistance, 10);
  
  // Generate more waypoints for a long route
  const points = generateRoutePoints(lat, lng, distance, 10, false);
  
  // Calculate actual distance
  const routeDistance = calculateTotalDistance(points);
  const elevationGain = Math.round(routeDistance * 12); // More elevation for long routes
  
  return formatRouteResponse(points, 'Long Route', routeDistance, elevationGain);
}

// Function to generate a loop route (starts and ends at same point)
function generateLoopRoute(lat: number, lng: number, maxDistance: number): any {
  // Loop route
  const distance = Math.min(maxDistance, 8);
  
  // Generate points for a loop route (enforced end = start)
  const points = generateRoutePoints(lat, lng, distance, 8, true);
  
  // Calculate actual distance
  const routeDistance = calculateTotalDistance(points);
  const elevationGain = Math.round(routeDistance * 10);
  
  return formatRouteResponse(points, 'Loop Route', routeDistance, elevationGain);
}

// Generate a route that follows actual roads using OSRM
async function generateRoadRoute(lat: number, lng: number, targetDistance: number, routeType: string): Promise<any> {
  // OSRM API endpoint
  const osrmBaseUrl = 'https://router.project-osrm.org/route/v1/';
  const profile = 'foot'; // Using foot routing for running routes
  
  try {
    let waypoints: Point[] = [];
    
    if (routeType === 'loop') {
      // Generate points around the starting point for a loop route
      // Increase the number of waypoints for a more natural loop
      const numPoints = 4; // Use more points for a better loop shape
      
      // Generate points in a rough circle with slight randomness
      const R = 6371; // Earth radius in km
      const radius = targetDistance / (2 * Math.PI); // Calculate radius to achieve target distance
      
      // Start point
      waypoints.push({ lat, lng });
      
      // Generate points around a circle with some randomness
      for (let i = 1; i <= numPoints; i++) {
        const angle = (2 * Math.PI * i / numPoints) + (Math.random() * 0.2 - 0.1); // Add some randomness
        const pointDistance = radius * (0.8 + Math.random() * 0.4); // Vary the distance slightly
        
        const pointLat = Math.asin(
          Math.sin(lat * Math.PI/180) * Math.cos(pointDistance/R) +
          Math.cos(lat * Math.PI/180) * Math.sin(pointDistance/R) * Math.cos(angle)
        ) * 180/Math.PI;
        
        const pointLng = lng + Math.atan2(
          Math.sin(angle) * Math.sin(pointDistance/R) * Math.cos(lat * Math.PI/180),
          Math.cos(pointDistance/R) - Math.sin(lat * Math.PI/180) * Math.sin(pointLat * Math.PI/180)
        ) * 180/Math.PI;
        
        waypoints.push({ lat: pointLat, lng: pointLng });
      }
      
      // Complete the loop
      waypoints.push({ lat, lng });
    } else if (routeType === 'long') {
      // For long routes, use more waypoints to create a more interesting path
      // Start point
      waypoints.push({ lat, lng });
      
      // Calculate base distance for each segment
      const segmentCount = 3; // Use more segments for long routes
      const segmentDistance = targetDistance / segmentCount;
      
      // Generate multiple waypoints in different directions
      let currentLat = lat;
      let currentLng = lng;
      
      for (let i = 0; i < segmentCount; i++) {
        // Vary the angle between segments for a more natural path
        const angle = Math.random() * 2 * Math.PI;
        const distance = segmentDistance * (0.7 + Math.random() * 0.6); // Vary segment length
        
        const R = 6371; // Earth radius in km
        const destLat = Math.asin(
          Math.sin(currentLat * Math.PI/180) * Math.cos(distance/R) +
          Math.cos(currentLat * Math.PI/180) * Math.sin(distance/R) * Math.cos(angle)
        ) * 180/Math.PI;
        
        const destLng = currentLng + Math.atan2(
          Math.sin(angle) * Math.sin(distance/R) * Math.cos(currentLat * Math.PI/180),
          Math.cos(distance/R) - Math.sin(currentLat * Math.PI/180) * Math.sin(destLat * Math.PI/180)
        ) * 180/Math.PI;
        
        waypoints.push({ lat: destLat, lng: destLng });
        
        // Update current position for next segment
        currentLat = destLat;
        currentLng = destLng;
      }
    } else {
      // For short routes, generate a destination point with a midpoint
      const angle = Math.random() * 2 * Math.PI; // Random direction
      const distance = targetDistance * 0.8; // Use 80% of target distance for direct line
      
      // Calculate destination point
      const R = 6371; // Earth radius in km
      const destLat = Math.asin(
        Math.sin(lat * Math.PI/180) * Math.cos(distance/R) +
        Math.cos(lat * Math.PI/180) * Math.sin(distance/R) * Math.cos(angle)
      ) * 180/Math.PI;
      
      const destLng = lng + Math.atan2(
        Math.sin(angle) * Math.sin(distance/R) * Math.cos(lat * Math.PI/180),
        Math.cos(distance/R) - Math.sin(lat * Math.PI/180) * Math.sin(destLat * Math.PI/180)
      ) * 180/Math.PI;
      
      // Add a slight deviation point to avoid straight line
      const midAngle = angle + (Math.random() * Math.PI/2 - Math.PI/4); // Slight deviation
      const midDistance = distance * 0.5; // Halfway
      
      const midLat = Math.asin(
        Math.sin(lat * Math.PI/180) * Math.cos(midDistance/R) +
        Math.cos(lat * Math.PI/180) * Math.sin(midDistance/R) * Math.cos(midAngle)
      ) * 180/Math.PI;
      
      const midLng = lng + Math.atan2(
        Math.sin(midAngle) * Math.sin(midDistance/R) * Math.cos(lat * Math.PI/180),
        Math.cos(midDistance/R) - Math.sin(lat * Math.PI/180) * Math.sin(midLat * Math.PI/180)
      ) * 180/Math.PI;
      
      waypoints = [
        { lat: lat, lng: lng },
        { lat: midLat, lng: midLng },
        { lat: destLat, lng: destLng }
      ];
    }
    
    // Convert waypoints to OSRM format
    const coordinatesString = waypoints
      .map(point => `${point.lng},${point.lat}`)
      .join(';');
    
    // Make request to OSRM
    const osrmUrl = `${osrmBaseUrl}${profile}/${coordinatesString}?overview=full&alternatives=true&geometries=geojson`;
    console.log(`Requesting OSRM route: ${osrmUrl}`);
    const response = await axios.get(osrmUrl);
    
    if (response.data.code !== 'Ok' || !response.data.routes || response.data.routes.length === 0) {
      throw new Error('Invalid response from OSRM');
    }
    
    // Get the route that's closest to our target distance
    const routes = response.data.routes;
    routes.sort((a: any, b: any) => {
      return Math.abs(a.distance/1000 - targetDistance) - Math.abs(b.distance/1000 - targetDistance);
    });
    
    const bestRoute = routes[0];
    const actualDistance = bestRoute.distance / 1000; // Convert meters to km
    const elevationGain = Math.round(actualDistance * 10); // Simple elevation estimate
    
    // Extract route points from geometry
    const routeCoordinates = bestRoute.geometry.coordinates;
    
    // Create the route response
    return {
      title: `${routeType.charAt(0).toUpperCase() + routeType.slice(1)} Route`,
      description: `Generated ${routeType} route with distance ${actualDistance.toFixed(2)}km`,
      distance: parseFloat(actualDistance.toFixed(2)),
      elevationGain: elevationGain,
      startPoint: {
        type: 'Point',
        coordinates: routeCoordinates[0]
      },
      endPoint: {
        type: 'Point',
        coordinates: routeCoordinates[routeCoordinates.length - 1]
      },
      path: {
        type: 'LineString',
        coordinates: routeCoordinates
      }
    };
  } catch (error) {
    console.error('OSRM API error:', error);
    throw error;
  }
}

// Save a route to the database
export const saveRoute = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
      return;
    }

    const { title, description, path, distance, elevationGain, startPoint, endPoint, completed } = req.body;

    // Validate input
    if (!title || !path || !distance) {
      res.status(400).json({
        success: false,
        message: 'Please provide title, path and distance'
      });
      return;
    }

    // If route is marked as completed, check if a similar completed route already exists
    if (completed) {
      // Check for similar routes by comparing path coordinates
      // We'll use the first and last coordinates to identify similar routes
      const startCoord = path.coordinates[0];
      const endCoord = path.coordinates[path.coordinates.length - 1];
      
      // Find routes by the user with similar start and end points
      const existingRoutes = await Route.find({
        user: req.user._id,
        completed: true,
        'startPoint.coordinates': { $near: { $geometry: { type: 'Point', coordinates: startCoord }, $maxDistance: 50 } },
        'endPoint.coordinates': { $near: { $geometry: { type: 'Point', coordinates: endCoord }, $maxDistance: 50 } },
        distance: { $gte: distance * 0.9, $lte: distance * 1.1 } // Within 10% of the distance
      });

      if (existingRoutes.length > 0) {
        // We found a similar completed route
        res.status(200).json({
          success: true,
          message: 'A similar completed route already exists',
          duplicate: true,
          data: existingRoutes[0]
        });
        return;
      }
    }

    // Create new route
    const newRoute = await Route.create({
      title,
      description: description || `Route created on ${new Date().toLocaleDateString()}`,
      user: req.user._id,
      distance: parseFloat(distance),
      elevationGain: elevationGain || 0,
      startPoint: startPoint || {
        type: 'Point',
        coordinates: path.coordinates[0]
      },
      endPoint: endPoint || {
        type: 'Point',
        coordinates: path.coordinates[path.coordinates.length - 1]
      },
      path: {
        type: 'LineString',
        coordinates: path.coordinates
      },
      isPublic: true,
      usageCount: 0,
      completed: completed || false
    });

    res.status(201).json({
      success: true,
      message: 'Route saved successfully',
      data: newRoute
    });
  } catch (error) {
    console.error('Save route error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while saving route'
    });
  }
};

// Get routes created by a user
export const getUserRoutes = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
      return;
    }

    const routes = await Route.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .select('title description distance elevationGain startPoint endPoint path createdAt isVerified');

    res.status(200).json({
      success: true,
      count: routes.length,
      data: routes
    });
  } catch (error) {
    console.error('Get routes error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching routes'
    });
  }
};

// Get routes near a location
export const getRoutesNearLocation = async (req: Request, res: Response): Promise<void> => {
  try {
    const { longitude, latitude, maxDistance } = req.query;
    
    if (!longitude || !latitude) {
      res.status(400).json({
        success: false,
        message: 'Please provide longitude and latitude'
      });
      return;
    }

    const lng = parseFloat(longitude as string);
    const lat = parseFloat(latitude as string);
    const distance = maxDistance ? parseFloat(maxDistance as string) : 5; // Default 5km (5000m)

    // Find routes with starting points within the given distance
    const routes = await Route.find({
      startPoint: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [lng, lat]
          },
          $maxDistance: distance * 1000 // Convert km to meters
        }
      },
      isPublic: true
    })
    .populate({
      path: 'user',
      select: 'firstName lastName username profilePicture' // Include only basic user details
    })
    .limit(10)
    .select('title description distance elevationGain startPoint endPoint path createdAt user isVerified');

    res.status(200).json({
      success: true,
      count: routes.length,
      data: routes
    });
  } catch (error) {
    console.error('Get nearby routes error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching nearby routes'
    });
  }
};

// Generate routes near a user location with options for type
export const generateRouteNearUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const { latitude, longitude, type, maxDistance } = req.body;
    
    // Validate input
    if (!latitude || !longitude || !type) {
      res.status(400).json({
        success: false,
        message: 'Please provide latitude, longitude, and route type (long/short/loop)'
      });
      return;
    }

    // Convert to numbers if they're strings
    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    const distance = maxDistance ? parseFloat(maxDistance) : 5; // Default 5km
    
    if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      res.status(400).json({
        success: false,
        message: 'Invalid coordinates. Latitude must be between -90 and 90, longitude between -180 and 180'
      });
      return;
    }

    // Generate route based on type
    let generatedRoute;
    try {
      switch (type.toLowerCase()) {
        case 'short':
          generatedRoute = await generateRoadRoute(lat, lng, Math.min(distance, 3), 'short');
          break;
        case 'long':
          generatedRoute = await generateRoadRoute(lat, lng, Math.min(distance, 10), 'long');
          break;
        case 'loop':
          generatedRoute = await generateRoadRoute(lat, lng, Math.min(distance, 8), 'loop');
          break;
        default:
          res.status(400).json({
            success: false,
            message: 'Invalid route type. Must be one of: short, long, loop'
          });
          return;
      }
    } catch (error) {
      console.error('Road route generation error:', error);
      // Fall back to the algorithmic route generation if the API fails
      switch (type.toLowerCase()) {
        case 'short':
          generatedRoute = generateShortRoute(lat, lng, Math.min(distance, 3));
          break;
        case 'long':
          generatedRoute = generateLongRoute(lat, lng, Math.min(distance, 10));
          break;
        case 'loop':
          generatedRoute = generateLoopRoute(lat, lng, Math.min(distance, 8));
          break;
      }
    }

    // Return generated route
    res.status(200).json({
      success: true,
      message: `${type} route generated successfully`,
      data: generatedRoute
    });

  } catch (error) {
    console.error('Route generation error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during route generation'
    });
  }
};

// Get route by ID
export const getRouteById = async (req: Request, res: Response): Promise<void> => {
  try {
    const routeId = req.params.id;
    
    if (!routeId) {
      res.status(400).json({
        success: false,
        message: 'Route ID is required'
      });
      return;
    }

    const route = await Route.findById(routeId);
    
    if (!route) {
      res.status(404).json({
        success: false,
        message: 'Route not found'
      });
      return;
    }

    // Check if the route is owned by the user or is public
    if (route.user.toString() !== req.user?._id.toString() && !route.isPublic) {
      res.status(403).json({
        success: false,
        message: 'You do not have permission to view this route'
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: route
    });
  } catch (error) {
    console.error('Get route by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching route details'
    });
  }
};

// Admin: Verify a route
export const verifyRoute = async (req: Request, res: Response): Promise<void> => {
  try {
    // Check if the user is an admin
    if (!req.user || req.user.role !== 'ADMIN') {
      res.status(403).json({
        success: false,
        message: 'Access denied: Admin privileges required'
      });
      return;
    }

    const { routeId } = req.params;

    if (!routeId) {
      res.status(400).json({
        success: false,
        message: 'Route ID is required'
      });
      return;
    }

    // Find the route by ID
    const route = await Route.findById(routeId);

    if (!route) {
      res.status(404).json({
        success: false,
        message: 'Route not found'
      });
      return;
    }

    // Update verification fields
    route.isVerified = true;
    route.verifiedBy = req.user._id;
    route.verificationDate = new Date();

    // Save the updated route
    await route.save();

    res.status(200).json({
      success: true,
      message: 'Route verified successfully',
      data: route
    });
  } catch (error) {
    console.error('Error verifying route:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while verifying route'
    });
  }
};

// Admin: Create route manually
export const adminCreateRoute = async (req: Request, res: Response): Promise<void> => {
  try {
    // Check if the user is an admin
    if (!req.user || req.user.role !== 'ADMIN') {
      res.status(403).json({
        success: false,
        message: 'Access denied: Admin privileges required'
      });
      return;
    }

    // Validate request body
    const { 
      title, 
      description, 
      distance,
      elevationGain, 
      startPoint, 
      endPoint, 
      path, 
      userId,  // User ID to assign the route to (optional)
      isPublic,
      isVerified 
    } = req.body;

    if (!title || !distance || !startPoint || !endPoint || !path) {
      res.status(400).json({
        success: false,
        message: 'Missing required fields: title, distance, startPoint, endPoint, path'
      });
      return;
    }

    // Validate GeoJSON format
    if (!startPoint.coordinates || startPoint.coordinates.length !== 2 || 
        !endPoint.coordinates || endPoint.coordinates.length !== 2 ||
        !path.coordinates || !Array.isArray(path.coordinates) || path.coordinates.length < 2) {
      res.status(400).json({
        success: false,
        message: 'Invalid GeoJSON format for startPoint, endPoint, or path'
      });
      return;
    }

    // Determine route owner (specified user or admin)
    const routeOwner = userId ? userId : req.user._id;
    
    // Verify user exists if userId is provided
    if (userId) {
      const userExists = await mongoose.model('User').findById(userId);
      if (!userExists) {
        res.status(404).json({
          success: false,
          message: 'User not found'
        });
        return;
      }
    }

    // Create new route
    const newRoute = new Route({
      title,
      description,
      user: routeOwner,
      distance,
      elevationGain: elevationGain || 0,
      startPoint: {
        type: 'Point',
        coordinates: startPoint.coordinates
      },
      endPoint: {
        type: 'Point',
        coordinates: endPoint.coordinates
      },
      path: {
        type: 'LineString',
        coordinates: path.coordinates
      },
      isPublic: isPublic !== undefined ? isPublic : true,
      usageCount: 0,
      completed: false,
      isVerified: isVerified !== undefined ? isVerified : true,
      verifiedBy: req.user._id,
      verificationDate: new Date()
    });

    // Save the new route
    await newRoute.save();

    res.status(201).json({
      success: true,
      message: 'Route created successfully',
      data: newRoute
    });
  } catch (error) {
    console.error('Error creating route:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while creating route'
    });
  }
};

// Add a new function to get routes pending verification for admins
export const getPendingRoutes = async (req: Request, res: Response): Promise<void> => {
  try {
    // Only allow admin users
    if (req.user.role !== 'ADMIN') {
      res.status(403).json({ success: false, message: 'Access denied: Admin privileges required' });
      return;
    }
    
    // Get all routes that are not verified yet
    const routes = await Route.find({ isVerified: false })
      .populate('user', 'username firstName lastName email')
      .sort({ createdAt: -1 });
    
    res.status(200).json({
      success: true,
      count: routes.length,
      data: routes
    });
  } catch (error) {
    console.error('Error getting pending routes:', error);
    res.status(500).json({ success: false, message: 'Server error while fetching pending routes' });
  }
};

export const getAllRoutes = async (req: Request, res: Response): Promise<void> => {
  try {
    // Only allow admin users
    if (req.user.role !== 'ADMIN') {
      res.status(403).json({ success: false, message: 'Access denied: Admin privileges required' });
      return;
    }
    
    // Get all routes with their user information
    const routes = await Route.find({})
      .populate('user', 'username firstName lastName email')
      .sort({ createdAt: -1 });
    
    res.status(200).json({
      success: true,
      count: routes.length,
      data: routes
    });
  } catch (error) {
    console.error('Error getting all routes:', error);
    res.status(500).json({ success: false, message: 'Server error while fetching routes' });
  }
};

// User: Create route manually (similar to admin create but for regular users)
export const userCreateRoute = async (req: Request, res: Response): Promise<void> => {
  try {
    // Ensure user is authenticated
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
      return;
    }

    // Validate request body
    const { 
      title, 
      description, 
      distance,
      elevationGain, 
      startPoint, 
      endPoint, 
      path, 
      isPublic
    } = req.body;

    if (!title || !distance || !startPoint || !endPoint || !path) {
      res.status(400).json({
        success: false,
        message: 'Missing required fields: title, distance, startPoint, endPoint, path'
      });
      return;
    }

    // Validate GeoJSON format
    if (!startPoint.coordinates || startPoint.coordinates.length !== 2 || 
        !endPoint.coordinates || endPoint.coordinates.length !== 2 ||
        !path.coordinates || !Array.isArray(path.coordinates) || path.coordinates.length < 2) {
      res.status(400).json({
        success: false,
        message: 'Invalid GeoJSON format for startPoint, endPoint, or path'
      });
      return;
    }

    // Create new route
    const newRoute = new Route({
      title,
      description: description || `Route created on ${new Date().toLocaleDateString()}`,
      user: req.user._id,
      distance,
      elevationGain: elevationGain || 0,
      startPoint: {
        type: 'Point',
        coordinates: startPoint.coordinates
      },
      endPoint: {
        type: 'Point',
        coordinates: endPoint.coordinates
      },
      path: {
        type: 'LineString',
        coordinates: path.coordinates
      },
      isPublic: isPublic !== undefined ? isPublic : true,
      usageCount: 0,
      completed: false,
      isVerified: false // User-created routes are not verified by default
    });

    // Save the new route
    await newRoute.save();

    res.status(201).json({
      success: true,
      message: 'Route created successfully',
      data: newRoute
    });
  } catch (error) {
    console.error('Error creating route:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while creating route'
    });
  }
}; 