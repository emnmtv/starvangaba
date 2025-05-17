import { Request, Response } from 'express';
import { Activity } from '../config/database';

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
    const query: any = { user: req.user._id };
    
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
      .select('title description type startTime endTime duration distance elevationGain averageSpeed route privacy simulated');

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