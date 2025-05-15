import { Server } from 'socket.io';
import http from 'http';
import jwt from 'jsonwebtoken';
import { User, ActiveSession } from '../config/database';

interface LiveTrackingUser {
  userId: string;
  socketId: string;
  username: string;
  currentLocation?: [number, number]; // [lat, lng]
  startTime: Date;
  followers: string[]; // List of follower user IDs
  trackingStats: {
    distance: number;
    duration: number;
    speed: number;
  };
}

class MapSocketServer {
  private io: Server;
  private activeUsers: Map<string, LiveTrackingUser> = new Map();
  
  constructor(server: http.Server) {
    this.io = new Server(server, {
      path: '/socket.io',
      cors: {
        origin: '*', // In production, restrict this to your frontend domain
        methods: ['GET', 'POST'],
        credentials: true
      },
      transports: ['websocket', 'polling'],
      pingTimeout: 10000,
      pingInterval: 25000
    });
    
    this.setupAuthentication();
    this.setupEventHandlers();
    
    console.log('Socket.IO server initialized for live tracking on path: /socket.io');
  }

  private setupAuthentication() {
    // Authenticate socket connections using JWT
    this.io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth.token;
        
        if (!token) {
          return next(new Error('Authentication token required'));
        }
        
        // Verify JWT token
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret_key') as any;
        
        // Get user from database
        const user = await User.findById(decoded.id).select('-password');
        
        if (!user) {
          return next(new Error('User not found'));
        }
        
        // Attach user data to socket
        socket.data.user = {
          _id: user._id,
          username: user.username,
          firstName: user.firstName,
          lastName: user.lastName
        };
        
        next();
      } catch (error) {
        console.error('Socket authentication error:', error);
        next(new Error('Authentication failed'));
      }
    });
  }

  private setupEventHandlers() {
    this.io.on('connection', (socket) => {
      console.log(`User connected: ${socket.data.user.username} (${socket.data.user._id})`);
      
      // Send immediate connection confirmation
      socket.emit('connection_confirmed', {
        success: true,
        message: 'Socket connection established',
        userId: socket.data.user._id,
        timestamp: new Date()
      });
      
      // Handle start tracking event
      socket.on('start_tracking', async (data) => {
        try {
          const user = socket.data.user;
          console.log(`User ${user.username} started tracking at ${new Date().toISOString()}`);
          
          // Validate incoming data
          if (!data.initialPosition || 
              !Array.isArray(data.initialPosition) || 
              data.initialPosition.length !== 2) {
            socket.emit('tracking_error', {
              success: false,
              message: 'Invalid initial position data'
            });
            return;
          }
          
          // Use server timestamp if client doesn't provide one
          const startTime = data.startTime ? new Date(data.startTime) : new Date();
          
          // Create active user entry
          const trackingUser: LiveTrackingUser = {
            userId: user._id.toString(),
            socketId: socket.id,
            username: user.username,
            currentLocation: data.initialPosition, // [lat, lng]
            startTime: startTime,
            followers: [], // Could be populated from the database
            trackingStats: {
              distance: 0,
              duration: 0,
              speed: 0
            }
          };
          
          // Store in active users map
          this.activeUsers.set(user._id.toString(), trackingUser);
          
          // Check if there's an existing active session
          const existingSession = await ActiveSession.findOne({ 
            user: user._id, 
            isActive: true 
          });
          
          // Create a new session or use existing one
          if (!existingSession) {
            // Convert position from [lat, lng] to [lng, lat] for GeoJSON
            const initialLocation = {
              type: 'Point',
              coordinates: [data.initialPosition[1], data.initialPosition[0]]
            };
            
            // Create a new session in the database
            await ActiveSession.create({
              user: user._id,
              startTime: trackingUser.startTime,
              isActive: true,
              currentLocation: initialLocation,
              currentSpeed: 0,
              currentDistance: 0,
              currentDuration: 0,
              lastUpdated: new Date()
            });
          }
          
          // Acknowledge successful start with precise timestamp for client sync
          socket.emit('tracking_started', {
            success: true,
            timestamp: startTime,
            serverTime: new Date(),
            message: 'Live tracking started successfully',
            trackingData: {
              userId: user._id,
              startTime: startTime,
              initialPosition: data.initialPosition
            }
          });
          
          // Send update every 5 seconds to keep time sync
          const timeSyncInterval = setInterval(() => {
            if (this.activeUsers.has(user._id.toString())) {
              const trackingUser = this.activeUsers.get(user._id.toString())!;
              const elapsedMs = Date.now() - trackingUser.startTime.getTime();
              socket.emit('time_sync', {
                serverTime: new Date(),
                elapsedMs: elapsedMs,
                startTime: trackingUser.startTime
              });
            } else {
              clearInterval(timeSyncInterval);
            }
          }, 5000);
          
          // Store interval in socket data for cleanup
          socket.data.timeSyncInterval = timeSyncInterval;
          
          // Notify followers that this user started tracking (optional feature)
          // this.notifyFollowers(user._id.toString(), 'user_started_tracking', { userId: user._id, username: user.username });
        } catch (error) {
          console.error('Error starting tracking:', error);
          socket.emit('tracking_error', {
            success: false,
            message: 'Failed to start tracking session'
          });
        }
      });
      
      // Handle location updates from user
      socket.on('location_update', async (data) => {
        try {
          const user = socket.data.user;
          const userId = user._id.toString();
          
          // Check if user is in active tracking list
          if (!this.activeUsers.has(userId)) {
            socket.emit('tracking_error', {
              success: false,
              message: 'No active tracking session found'
            });
            return;
          }
          
          const trackingUser = this.activeUsers.get(userId)!;
          const newPosition = data.position; // [lat, lng]
          
          // Calculate incremental distance if there's a previous position
          if (trackingUser.currentLocation) {
            const prevLat = trackingUser.currentLocation[0];
            const prevLng = trackingUser.currentLocation[1];
            const newLat = newPosition[0];
            const newLng = newPosition[1];
            
            // Use Haversine formula to calculate distance
            const R = 6371; // Earth's radius in km
            const dLat = this.deg2rad(newLat - prevLat);
            const dLon = this.deg2rad(newLng - prevLng);
            const a = 
              Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(this.deg2rad(prevLat)) * Math.cos(this.deg2rad(newLat)) * 
              Math.sin(dLon/2) * Math.sin(dLon/2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
            const distance = R * c;
            
            // Update tracking stats
            trackingUser.trackingStats.distance += distance;
            const currentTime = new Date();
            trackingUser.trackingStats.duration = 
              (currentTime.getTime() - trackingUser.startTime.getTime()) / 1000; // seconds
            
            // Calculate current speed (km/h) based on recent movement
            if (trackingUser.trackingStats.duration > 0) {
              trackingUser.trackingStats.speed = 
                (trackingUser.trackingStats.distance / trackingUser.trackingStats.duration) * 3600; // km/h
            }
          }
          
          // Update user's current location
          trackingUser.currentLocation = newPosition;
          this.activeUsers.set(userId, trackingUser);
          
          // Update session in database
          await ActiveSession.findOneAndUpdate(
            { user: user._id, isActive: true },
            { 
              currentLocation: { 
                type: 'Point', 
                coordinates: [newPosition[1], newPosition[0]] // Convert to [lng, lat] for GeoJSON
              },
              currentSpeed: trackingUser.trackingStats.speed,
              currentDistance: trackingUser.trackingStats.distance,
              currentDuration: trackingUser.trackingStats.duration,
              lastUpdated: new Date()
            }
          );
          
          // Acknowledge the update with precise stats
          socket.emit('location_update_ack', {
            success: true,
            timestamp: new Date(),
            stats: {
              distance: trackingUser.trackingStats.distance,
              duration: trackingUser.trackingStats.duration,
              speed: trackingUser.trackingStats.speed,
              elapsedMs: Date.now() - trackingUser.startTime.getTime()
            }
          });
          
          // Broadcast to followers (optional)
          // this.broadcastLocationToFollowers(userId, newPosition, trackingUser.trackingStats);
        } catch (error) {
          console.error('Error updating location:', error);
          socket.emit('tracking_error', {
            success: false,
            message: 'Failed to update location'
          });
        }
      });
      
      // Handle end tracking event
      socket.on('end_tracking', async (data) => {
        try {
          const user = socket.data.user;
          const userId = user._id.toString();
          
          if (!this.activeUsers.has(userId)) {
            socket.emit('tracking_error', {
              success: false,
              message: 'No active tracking session found'
            });
            return;
          }
          
          const trackingUser = this.activeUsers.get(userId)!;
          
          // Find active session
          const session = await ActiveSession.findOne({ 
            user: user._id, 
            isActive: true 
          });
          
          if (session) {
            // Mark session as inactive
            session.isActive = false;
            await session.save();
            
            // Additional processing like creating an activity could be done here
            // or handled by a separate API call
          }
          
          // Remove user from active tracking
          this.activeUsers.delete(userId);
          
          // Clear time sync interval if exists
          if (socket.data.timeSyncInterval) {
            clearInterval(socket.data.timeSyncInterval);
            socket.data.timeSyncInterval = null;
          }
          
          // Acknowledge end of tracking
          socket.emit('tracking_ended', {
            success: true,
            timestamp: new Date(),
            message: 'Tracking session ended',
            stats: trackingUser.trackingStats,
            finalDistance: trackingUser.trackingStats.distance,
            finalDuration: trackingUser.trackingStats.duration
          });
          
          // Notify followers (optional)
          // this.notifyFollowers(userId, 'user_ended_tracking', { userId, username: user.username });
        } catch (error) {
          console.error('Error ending tracking:', error);
          socket.emit('tracking_error', {
            success: false,
            message: 'Failed to end tracking session'
          });
        }
      });
      
      // Handle disconnection
      socket.on('disconnect', async () => {
        const user = socket.data.user;
        
        if (!user) return;
        
        const userId = user._id.toString();
        console.log(`User disconnected: ${user.username} (${userId})`);
        
        // Clear any intervals
        if (socket.data.timeSyncInterval) {
          clearInterval(socket.data.timeSyncInterval);
          socket.data.timeSyncInterval = null;
        }
        
        // Check if user was tracking
        if (this.activeUsers.has(userId)) {
          try {
            // Find and update the active session
            const session = await ActiveSession.findOne({ 
              user: user._id, 
              isActive: true 
            });
            
            if (session) {
              // Don't automatically end the session, just mark the disconnect time
              // This allows reconnection to the same session
              session.lastUpdated = new Date();
              await session.save();
            }
            
            // Keep the user in activeUsers for potential reconnection
            // A cleanup job could periodically remove stale sessions
          } catch (error) {
            console.error('Error handling disconnect:', error);
          }
        }
      });
    });
  }
  
  // Helper method to convert degrees to radians
  private deg2rad(deg: number): number {
    return deg * (Math.PI / 180);
  }
  
  // Helper method to broadcast location to followers (optional feature)
  private broadcastLocationToFollowers(userId: string, position: [number, number], stats: any) {
    const trackingUser = this.activeUsers.get(userId);
    
    if (!trackingUser) return;
    
    // In a real implementation, you'd get followers from the database
    // or maintain a followers map in memory
    trackingUser.followers.forEach(followerId => {
      // Find if follower is connected
      for (const [activeUserId, activeUser] of this.activeUsers.entries()) {
        if (activeUserId === followerId) {
          this.io.to(activeUser.socketId).emit('followed_user_location', {
            userId,
            username: trackingUser.username,
            position,
            stats
          });
          break;
        }
      }
    });
  }
  
  // Helper method to notify followers about events (optional)
  private notifyFollowers(userId: string, eventType: string, data: any) {
    const trackingUser = this.activeUsers.get(userId);
    
    if (!trackingUser) return;
    
    trackingUser.followers.forEach(followerId => {
      for (const [activeUserId, activeUser] of this.activeUsers.entries()) {
        if (activeUserId === followerId) {
          this.io.to(activeUser.socketId).emit(eventType, data);
          break;
        }
      }
    });
  }
}

export default MapSocketServer; 