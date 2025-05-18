import { Request, Response } from 'express';
import { Challenge, User, Activity } from '../config/database';
import mongoose from 'mongoose';

// Create a new challenge (admin only)
export const createChallenge = async (req: Request, res: Response): Promise<void> => {
  try {
    // Check if user is admin
    if (!req.user || req.user.role !== 'ADMIN') {
      res.status(403).json({
        success: false,
        message: 'Access denied: Admin privileges required'
      });
      return;
    }

    const { title, description, type, goal, startDate, endDate } = req.body;

    // Validate required fields
    if (!title || !description || !type || !goal || !startDate || !endDate) {
      res.status(400).json({
        success: false,
        message: 'Please provide all required fields: title, description, type, goal, startDate, endDate'
      });
      return;
    }

    // Validate challenge type
    const validTypes = ['distance', 'time', 'elevation', 'frequency'];
    if (!validTypes.includes(type)) {
      res.status(400).json({
        success: false,
        message: `Invalid challenge type. Must be one of: ${validTypes.join(', ')}`
      });
      return;
    }

    // Validate goal based on type
    if (typeof goal !== 'number' || goal <= 0) {
      res.status(400).json({
        success: false,
        message: 'Goal must be a positive number'
      });
      return;
    }

    // Validate dates
    const parsedStartDate = new Date(startDate);
    const parsedEndDate = new Date(endDate);

    if (isNaN(parsedStartDate.getTime()) || isNaN(parsedEndDate.getTime())) {
      res.status(400).json({
        success: false,
        message: 'Invalid date format. Use ISO format (YYYY-MM-DD)'
      });
      return;
    }

    if (parsedStartDate >= parsedEndDate) {
      res.status(400).json({
        success: false,
        message: 'End date must be after start date'
      });
      return;
    }

    // Create the challenge
    const newChallenge = await Challenge.create({
      title,
      description,
      type,
      goal,
      startDate: parsedStartDate,
      endDate: parsedEndDate,
      participants: [],
      createdBy: req.user._id
    });

    res.status(201).json({
      success: true,
      message: 'Challenge created successfully',
      data: newChallenge
    });
  } catch (error) {
    console.error('Create challenge error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while creating challenge'
    });
  }
};

// Get all challenges
export const getAllChallenges = async (req: Request, res: Response): Promise<void> => {
  try {
    // Parse query parameters
    const { active } = req.query;
    const query: any = {};

    // Filter for active challenges if requested
    if (active === 'true') {
      const now = new Date();
      query.startDate = { $lte: now };
      query.endDate = { $gte: now };
    } else if (active === 'false') {
      const now = new Date();
      query.$or = [
        { startDate: { $gt: now } }, // Future challenges
        { endDate: { $lt: now } }    // Past challenges
      ];
    }

    // Get challenges with creator info
    const challenges = await Challenge.find(query)
      .populate('createdBy', 'username firstName lastName')
      .sort({ startDate: -1 });

    res.status(200).json({
      success: true,
      count: challenges.length,
      data: challenges
    });
  } catch (error) {
    console.error('Get challenges error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching challenges'
    });
  }
};

// Get challenge by ID
export const getChallengeById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({
        success: false,
        message: 'Invalid challenge ID'
      });
      return;
    }

    // Get challenge with creator and participant info
    const challenge = await Challenge.findById(id)
      .populate('createdBy', 'username firstName lastName profilePicture')
      .populate('participants.user', 'username firstName lastName profilePicture');

    if (!challenge) {
      res.status(404).json({
        success: false,
        message: 'Challenge not found'
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: challenge
    });
  } catch (error) {
    console.error('Get challenge error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching challenge'
    });
  }
};

// Update challenge details (admin only)
export const updateChallenge = async (req: Request, res: Response): Promise<void> => {
  try {
    // Check if user is admin
    if (!req.user || req.user.role !== 'ADMIN') {
      res.status(403).json({
        success: false,
        message: 'Access denied: Admin privileges required'
      });
      return;
    }

    const { id } = req.params;
    const { title, description, type, goal, startDate, endDate } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({
        success: false,
        message: 'Invalid challenge ID'
      });
      return;
    }

    // Find the challenge
    const challenge = await Challenge.findById(id);

    if (!challenge) {
      res.status(404).json({
        success: false,
        message: 'Challenge not found'
      });
      return;
    }

    // Check if challenge has started and has participants
    const hasStarted = new Date() > new Date(challenge.startDate);
    const hasParticipants = challenge.participants.length > 0;

    // Prepare update data
    const updateData: any = {};
    if (title) updateData.title = title;
    if (description) updateData.description = description;

    // Only allow changing type and goal if challenge hasn't started
    if (!hasStarted) {
      if (type) {
        // Validate challenge type
        const validTypes = ['distance', 'time', 'elevation', 'frequency'];
        if (!validTypes.includes(type)) {
          res.status(400).json({
            success: false,
            message: `Invalid challenge type. Must be one of: ${validTypes.join(', ')}`
          });
          return;
        }
        updateData.type = type;
      }

      if (goal !== undefined) {
        // Validate goal
        if (typeof goal !== 'number' || goal <= 0) {
          res.status(400).json({
            success: false,
            message: 'Goal must be a positive number'
          });
          return;
        }
        updateData.goal = goal;
      }
    } else if (type || goal !== undefined) {
      res.status(400).json({
        success: false,
        message: 'Cannot change type or goal for challenges that have already started'
      });
      return;
    }

    // Validate and update dates
    if (startDate) {
      const parsedStartDate = new Date(startDate);
      
      if (isNaN(parsedStartDate.getTime())) {
        res.status(400).json({
          success: false,
          message: 'Invalid start date format. Use ISO format (YYYY-MM-DD)'
        });
        return;
      }
      
      // Only allow changing start date if challenge hasn't started and has no participants
      if (hasStarted || hasParticipants) {
        res.status(400).json({
          success: false,
          message: 'Cannot change start date for challenges that have already started or have participants'
        });
        return;
      }
      
      updateData.startDate = parsedStartDate;
    }

    if (endDate) {
      const parsedEndDate = new Date(endDate);
      
      if (isNaN(parsedEndDate.getTime())) {
        res.status(400).json({
          success: false,
          message: 'Invalid end date format. Use ISO format (YYYY-MM-DD)'
        });
        return;
      }
      
      // Ensure end date is after start date (either new or existing)
      const effectiveStartDate = updateData.startDate || challenge.startDate;
      if (parsedEndDate <= new Date(effectiveStartDate)) {
        res.status(400).json({
          success: false,
          message: 'End date must be after start date'
        });
        return;
      }
      
      updateData.endDate = parsedEndDate;
    }

    // Update the challenge
    const updatedChallenge = await Challenge.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true, runValidators: true }
    );

    res.status(200).json({
      success: true,
      message: 'Challenge updated successfully',
      data: updatedChallenge
    });
  } catch (error) {
    console.error('Update challenge error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating challenge'
    });
  }
};

// Delete challenge (admin only)
export const deleteChallenge = async (req: Request, res: Response): Promise<void> => {
  try {
    // Check if user is admin
    if (!req.user || req.user.role !== 'ADMIN') {
      res.status(403).json({
        success: false,
        message: 'Access denied: Admin privileges required'
      });
      return;
    }

    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({
        success: false,
        message: 'Invalid challenge ID'
      });
      return;
    }

    // Find the challenge
    const challenge = await Challenge.findById(id);

    if (!challenge) {
      res.status(404).json({
        success: false,
        message: 'Challenge not found'
      });
      return;
    }

    // Check if challenge has participants
    if (challenge.participants.length > 0) {
      res.status(400).json({
        success: false,
        message: 'Cannot delete challenge with participants'
      });
      return;
    }

    // Delete the challenge
    await Challenge.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: 'Challenge deleted successfully'
    });
  } catch (error) {
    console.error('Delete challenge error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while deleting challenge'
    });
  }
};

// Join a challenge (for regular users)
export const joinChallenge = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
      return;
    }

    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({
        success: false,
        message: 'Invalid challenge ID'
      });
      return;
    }

    // Find the challenge
    const challenge = await Challenge.findById(id);

    if (!challenge) {
      res.status(404).json({
        success: false,
        message: 'Challenge not found'
      });
      return;
    }

    // Check if challenge has started
    const now = new Date();
    if (now < new Date(challenge.startDate)) {
      res.status(400).json({
        success: false,
        message: 'Challenge has not started yet'
      });
      return;
    }

    // Check if challenge has ended
    if (now > new Date(challenge.endDate)) {
      res.status(400).json({
        success: false,
        message: 'Challenge has already ended'
      });
      return;
    }

    // Check if user is already participating
    const isParticipating = challenge.participants.some(p => 
      p.user.toString() === req.user._id.toString()
    );

    if (isParticipating) {
      res.status(400).json({
        success: false,
        message: 'You are already participating in this challenge'
      });
      return;
    }

    // Add user to participants
    challenge.participants.push({
      user: req.user._id,
      progress: 0,
      completed: false
    });

    await challenge.save();

    res.status(200).json({
      success: true,
      message: 'Successfully joined the challenge',
      data: challenge
    });
  } catch (error) {
    console.error('Join challenge error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while joining challenge'
    });
  }
};

// Leave a challenge (for regular users)
export const leaveChallenge = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
      return;
    }

    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({
        success: false,
        message: 'Invalid challenge ID'
      });
      return;
    }

    // Find the challenge
    const challenge = await Challenge.findById(id);

    if (!challenge) {
      res.status(404).json({
        success: false,
        message: 'Challenge not found'
      });
      return;
    }

    // Check if user is participating
    const participantIndex = challenge.participants.findIndex(p => 
      p.user.toString() === req.user._id.toString()
    );

    if (participantIndex === -1) {
      res.status(400).json({
        success: false,
        message: 'You are not participating in this challenge'
      });
      return;
    }

    // Remove user from participants
    challenge.participants.splice(participantIndex, 1);
    await challenge.save();

    res.status(200).json({
      success: true,
      message: 'Successfully left the challenge'
    });
  } catch (error) {
    console.error('Leave challenge error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while leaving challenge'
    });
  }
};

// Get user's challenges
export const getUserChallenges = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
      return;
    }

    // Parse query parameters
    const { status } = req.query;
    const query: any = {
      'participants.user': req.user._id
    };

    // Filter by status if specified
    if (status === 'active') {
      const now = new Date();
      query.startDate = { $lte: now };
      query.endDate = { $gte: now };
    } else if (status === 'completed') {
      query.endDate = { $lt: new Date() };
    } else if (status === 'upcoming') {
      query.startDate = { $gt: new Date() };
    }

    // Get user's challenges
    const challenges = await Challenge.find(query)
      .populate('createdBy', 'username firstName lastName')
      .sort({ startDate: -1 });

    res.status(200).json({
      success: true,
      count: challenges.length,
      data: challenges
    });
  } catch (error) {
    console.error('Get user challenges error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching user challenges'
    });
  }
};

// Admin: Get leaderboard for a challenge
export const getChallengeLeaderboard = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({
        success: false,
        message: 'Invalid challenge ID'
      });
      return;
    }

    // Find the challenge
    const challenge = await Challenge.findById(id)
      .populate('participants.user', 'username firstName lastName profilePicture');

    if (!challenge) {
      res.status(404).json({
        success: false,
        message: 'Challenge not found'
      });
      return;
    }

    // Sort participants by progress descending
    const leaderboard = [...challenge.participants]
      .sort((a, b) => b.progress - a.progress)
      .map((participant, index) => ({
        rank: index + 1,
        user: participant.user,
        progress: participant.progress,
        completed: participant.completed,
        completedDate: participant.completedDate
      }));

    res.status(200).json({
      success: true,
      data: {
        challenge: {
          id: challenge._id,
          title: challenge.title,
          type: challenge.type,
          goal: challenge.goal
        },
        leaderboard
      }
    });
  } catch (error) {
    console.error('Get challenge leaderboard error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching challenge leaderboard'
    });
  }
};

// Helper function to update a user's progress in all relevant challenges when they complete a new activity
export const updateUserChallengeProgress = async (userId: string, activity: any): Promise<void> => {
  try {
    // Find all active challenges the user is participating in
    const now = new Date();
    const userChallenges = await Challenge.find({
      'participants.user': userId,
      startDate: { $lte: now },
      endDate: { $gte: now }
    });

    if (userChallenges.length === 0) {
      console.log(`No active challenges found for user ${userId}`);
      return;
    }

    console.log(`Updating ${userChallenges.length} challenges for user ${userId} based on new activity`);

    for (const challenge of userChallenges) {
      // Find the user's participant entry
      const participantIndex = challenge.participants.findIndex(
        (p: any) => p.user && p.user.toString() === userId
      );
      
      if (participantIndex === -1) {
        console.log(`User ${userId} not found in participants list for challenge ${challenge._id}`);
        continue;
      }

      const participant = challenge.participants[participantIndex];
      let progressIncrement = 0;
      
      // Calculate progress increment based on challenge type
      switch (challenge.type) {
        case 'distance':
          // Activity distance is in meters, convert to km for distance challenges
          progressIncrement = activity.distance / 1000; // Convert to km
          break;
        case 'time':
          progressIncrement = activity.duration; // In seconds
          break;
        case 'elevation':
          progressIncrement = activity.elevationGain || 0; // In meters
          break;
        case 'frequency':
          progressIncrement = 1; // Count of activities
          break;
        default:
          progressIncrement = 0;
      }

      // Update the participant's progress - directly modify properties to maintain references
      const newProgress = participant.progress + progressIncrement;
      const completed = newProgress >= challenge.goal;
      
      // Update properties directly rather than replacing the whole object
      challenge.participants[participantIndex].progress = newProgress;
      challenge.participants[participantIndex].completed = completed;
      
      // Only set completion date if newly completed
      if (completed && !participant.completed) {
        challenge.participants[participantIndex].completedDate = new Date();
      }
      
      try {
        // Save the updated challenge
        await challenge.save();
        console.log(`Updated challenge ${challenge._id} progress for user ${userId}: +${progressIncrement}, new total: ${newProgress}/${challenge.goal}`);
        
        if (completed && !participant.completed) {
          console.log(`User ${userId} completed challenge ${challenge._id}!`);
        }
      } catch (saveError) {
        console.error(`Error saving challenge ${challenge._id}:`, saveError);
      }
    }
  } catch (error) {
    console.error('Error updating user challenge progress:', error);
  }
}; 