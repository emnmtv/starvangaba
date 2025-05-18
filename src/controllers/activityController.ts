import { Request, Response } from 'express';
import { Activity } from '../config/database';
import mongoose from 'mongoose';

// Get activities for the current user
export const getUserActivities = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
      return;
    }

    // Extract query parameters for filtering and pagination
    const { limit = 10, skip = 0, sort = '-startTime', type, simulated } = req.query;
    
    // Build query
    const query: any = { 
      user: req.user._id,
      archived: { $ne: true } // Exclude archived activities
    };
    
    // Add type filter if specified
    if (type) {
      query.type = type;
    }

    // Add simulation filter if specified
    if (simulated === 'true') {
      query.simulated = true;
    } else if (simulated === 'false') {
      query.simulated = false;
    }

    // Execute query with pagination and sorting
    const activities = await Activity.find(query)
      .sort(sort as string)
      .skip(parseInt(skip as string))
      .limit(parseInt(limit as string))
      .select('title description type startTime endTime duration distance elevationGain averageSpeed route privacy steps calories simulated');

    // Get total count for pagination
    const total = await Activity.countDocuments(query);

    res.status(200).json({
      success: true,
      count: activities.length,
      total,
      data: activities
    });
  } catch (error) {
    console.error('Get activities error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching activities'
    });
  }
};

// Get a specific activity by ID
export const getActivityById = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
      return;
    }

    const activityId = req.params.id;
    
    if (!activityId) {
      res.status(400).json({
        success: false,
        message: 'Activity ID is required'
      });
      return;
    }

    const activity = await Activity.findById(activityId);
    
    if (!activity) {
      res.status(404).json({
        success: false,
        message: 'Activity not found'
      });
      return;
    }

    // Check if the user has permission to view this activity
    if (activity.user.toString() !== req.user._id.toString() && activity.privacy !== 'public') {
      // If activity is private, check if the user is a follower
      if (activity.privacy === 'followers') {
        // You would need to implement a check for followers here
        // For now, we'll just deny access
        res.status(403).json({
          success: false,
          message: 'You do not have permission to view this activity'
        });
        return;
      } else {
        // Activity is private
        res.status(403).json({
          success: false,
          message: 'You do not have permission to view this activity'
        });
        return;
      }
    }

    res.status(200).json({
      success: true,
      data: activity
    });
  } catch (error) {
    console.error('Get activity by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching activity details'
    });
  }
};

// Archive an activity - hide without deleting
export const archiveActivity = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
      return;
    }

    const activityId = req.params.id;
    
    if (!activityId) {
      res.status(400).json({
        success: false,
        message: 'Activity ID is required'
      });
      return;
    }

    // Find the activity and verify ownership
    const activity = await Activity.findById(activityId);
    
    if (!activity) {
      res.status(404).json({
        success: false,
        message: 'Activity not found'
      });
      return;
    }

    // Verify ownership
    if (activity.user.toString() !== req.user._id.toString()) {
      res.status(403).json({
        success: false,
        message: 'You do not have permission to archive this activity'
      });
      return;
    }

    // Mark as archived
    activity.archived = true;
    activity.archivedAt = new Date();
    await activity.save();

    res.status(200).json({
      success: true,
      message: 'Activity archived successfully',
      data: {
        _id: activity._id,
        title: activity.title,
        archivedAt: activity.archivedAt
      }
    });
  } catch (error) {
    console.error('Archive activity error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while archiving activity'
    });
  }
};

// Restore an archived activity
export const restoreActivity = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
      return;
    }

    const activityId = req.params.id;
    
    if (!activityId) {
      res.status(400).json({
        success: false,
        message: 'Activity ID is required'
      });
      return;
    }

    // Find the activity and verify ownership
    const activity = await Activity.findById(activityId);
    
    if (!activity) {
      res.status(404).json({
        success: false,
        message: 'Activity not found'
      });
      return;
    }

    // Verify ownership
    if (activity.user.toString() !== req.user._id.toString()) {
      res.status(403).json({
        success: false,
        message: 'You do not have permission to restore this activity'
      });
      return;
    }

    // Ensure activity is actually archived
    if (!activity.archived) {
      res.status(400).json({
        success: false,
        message: 'Activity is not archived'
      });
      return;
    }

    // Restore from archive
    activity.archived = false;
    activity.archivedAt = undefined;
    await activity.save();

    res.status(200).json({
      success: true,
      message: 'Activity restored successfully',
      data: {
        _id: activity._id,
        title: activity.title
      }
    });
  } catch (error) {
    console.error('Restore activity error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while restoring activity'
    });
  }
};

// Get archived activities
export const getArchivedActivities = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
      return;
    }

    // Extract query parameters for filtering and pagination
    const { limit = 10, skip = 0, sort = '-archivedAt' } = req.query;
    
    // Build query for archived activities
    const query = { 
      user: req.user._id,
      archived: true
    };

    // Execute query with pagination and sorting
    const activities = await Activity.find(query)
      .sort(sort as string)
      .skip(parseInt(skip as string))
      .limit(parseInt(limit as string))
      .select('title description type startTime endTime duration distance elevationGain averageSpeed route privacy steps calories simulated archivedAt');

    // Get total count for pagination
    const total = await Activity.countDocuments(query);

    res.status(200).json({
      success: true,
      count: activities.length,
      total,
      data: activities
    });
  } catch (error) {
    console.error('Get archived activities error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching archived activities'
    });
  }
};

// Get user activity statistics (total distance, time, steps, calories, etc.)
export const getUserStats = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
      return;
    }

    // Extract query parameters for date range filtering
    const { startDate, endDate, type } = req.query;
    
    // Build the match stage for aggregation
    const match: any = { 
      user: new mongoose.Types.ObjectId(req.user._id.toString()),
      archived: { $ne: true } // Exclude archived activities from stats
    };
    
    // Add date range filter if specified
    if (startDate || endDate) {
      match.startTime = {};
      if (startDate) {
        match.startTime.$gte = new Date(startDate as string);
      }
      if (endDate) {
        match.startTime.$lte = new Date(endDate as string);
      }
    }
    
    // Add activity type filter if specified
    if (type) {
      match.type = type;
    }
    
    // Perform aggregation to calculate statistics
    const stats = await Activity.aggregate([
      { $match: match },
      { 
        $group: {
          _id: null,
          totalActivities: { $sum: 1 },
          totalDistance: { $sum: '$distance' }, // in meters
          totalDuration: { $sum: '$duration' }, // in seconds
          totalSteps: { $sum: '$steps' },
          totalCalories: { $sum: '$calories' },
          totalElevationGain: { $sum: '$elevationGain' },
          activities: { 
            $push: { 
              id: '$_id', 
              type: '$type', 
              startTime: '$startTime', 
              distance: '$distance', 
              duration: '$duration',
              calories: '$calories',
              steps: '$steps'
            } 
          }
        } 
      },
      {
        $project: {
          _id: 0,
          totalActivities: 1,
          totalDistance: 1,
          totalDuration: 1,
          totalSteps: 1,
          totalCalories: 1,
          totalElevationGain: 1,
          // Only include the last 5 activities in the result
          recentActivities: { $slice: ['$activities', -5] }
        }
      }
    ]);
    
    // If no activities found, return zeros for all stats
    if (stats.length === 0) {
      res.status(200).json({
        success: true,
        data: {
          totalActivities: 0,
          totalDistance: 0,
          totalDuration: 0,
          totalSteps: 0,
          totalCalories: 0,
          totalElevationGain: 0,
          recentActivities: []
        }
      });
      return;
    }
    
    // Calculate additional statistics
    const data = stats[0];
    
    // Add average pace (seconds per km)
    let averagePace = 0;
    if (data.totalDistance > 0) {
      // Check if distance is likely in km rather than meters
      const distanceInKm = data.totalDistance < 100 
        ? data.totalDistance  // Already in km
        : data.totalDistance / 1000;  // Convert from meters to km
      
      averagePace = Math.round(data.totalDuration / distanceInKm);
      data.averagePace = averagePace;
      
      // Ensure average pace is reasonable (cap at maximum reasonable pace)
      if (averagePace > 1800) { // Cap at 30 minutes per km (1800 seconds)
        averagePace = 1800;
        data.averagePace = 1800;
        console.log(`Adjusted unreasonable pace to maximum value of 1800 seconds/km for user ${req.user._id}`);
      }
      
      // Convert to human-readable format (mm:ss per km)
      const minutes = Math.floor(averagePace / 60);
      const seconds = Math.round(averagePace % 60);
      data.averagePaceFormatted = `${minutes}:${seconds.toString().padStart(2, '0')} min/km`;
      
      // Update the user's average pace in their profile
      try {
        await mongoose.model('User').findByIdAndUpdate(
          req.user._id,
          { $set: { averagePace: averagePace } }
        );
        console.log(`Updated average pace for user ${req.user._id}: ${averagePace} seconds/km`);
      } catch (updateError) {
        console.error('Error updating user average pace:', updateError);
        // Continue even if the update fails
      }
    } else {
      data.averagePace = 0;
      data.averagePaceFormatted = '0:00 min/km';
    }
    
    // Add average speed (km/h)
    data.averageSpeed = data.totalDuration > 0
      ? Math.round((data.totalDistance / 1000) / (data.totalDuration / 3600) * 10) / 10
      : 0;
    
    // Format duration into hours, minutes, seconds
    const hours = Math.floor(data.totalDuration / 3600);
    const minutes = Math.floor((data.totalDuration % 3600) / 60);
    const seconds = Math.floor(data.totalDuration % 60);
    data.durationFormatted = `${hours}h ${minutes}m ${seconds}s`;
    
    // Format distance in km
    data.distanceFormatted = `${(data.totalDistance / 1000).toFixed(2)} km`;
    
    res.status(200).json({
      success: true,
      data
    });
  } catch (error) {
    console.error('Get user stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching user statistics'
    });
  }
}; 