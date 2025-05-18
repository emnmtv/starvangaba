import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { User, IUser } from '../config/database';
import { generateToken } from '../middleware/authMiddleware';
import mongoose from 'mongoose';
import path from 'path';
import fs from 'fs';
import { WeightHistory, Activity } from '../config/database';

// User registration controller
export const registerUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const { username, firstName, lastName, email, password } = req.body;

    // Validate input
    if (!username || !firstName || !lastName || !email || !password) {
      res.status(400).json({ 
        success: false, 
        message: 'Please provide all required fields: username, firstName, lastName, email, and password' 
      });
      return;
    }

    // Check if user already exists
    const existingUser = await User.findOne({ 
      $or: [{ email }, { username }] 
    });

    if (existingUser) {
      res.status(409).json({ 
        success: false, 
        message: 'User with this email or username already exists' 
      });
      return;
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create new user with explicit type
    const newUser = await User.create({
      username,
      firstName,
      lastName,
      email,
      password: hashedPassword,
      role: 'USER', // Default role
      activityPreferences: {
        privacyDefault: 'public',
        distanceUnit: 'km',
        paceUnit: 'min/km'
      }
    });

    // Generate JWT token
    const userId = newUser._id as unknown as mongoose.Types.ObjectId;
    const token = generateToken(userId.toString());

    // Return user data (without password)
    const userData = {
      _id: userId,
      username: newUser.username,
      firstName: newUser.firstName,
      lastName: newUser.lastName,
      email: newUser.email,
      role: newUser.role,
      activityPreferences: newUser.activityPreferences,
      createdAt: newUser.createdAt
    };

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      token,
      data: userData
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error during registration' 
    });
  }
};

// User login controller
export const loginUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      res.status(400).json({ 
        success: false, 
        message: 'Please provide email and password' 
      });
      return;
    }

    // Find user by email
    const user = await User.findOne({ email });

    if (!user) {
      res.status(401).json({ 
        success: false, 
        message: 'Invalid email or password' 
      });
      return;
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    
    if (!isPasswordValid) {
      res.status(401).json({ 
        success: false, 
        message: 'Invalid email or password' 
      });
      return;
    }

    // Generate JWT token
    const userId = user._id as unknown as mongoose.Types.ObjectId;
    const token = generateToken(userId.toString());

    // Return user data
    const userData = {
      _id: userId,
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
      activityPreferences: user.activityPreferences
    };

    res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      data: userData
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error during login' 
    });
  }
};

// Update user profile controller - allows updating weight, height, and other profile info
export const updateUserProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
      return;
    }

    const { weight, height, age, firstName, lastName, bio } = req.body;
    
    // Validate numeric inputs if provided
    if (weight !== undefined && (isNaN(weight) || weight <= 0 || weight > 300)) {
      res.status(400).json({
        success: false,
        message: 'Weight must be a positive number between 1 and 300 kg'
      });
      return;
    }
    
    if (height !== undefined && (isNaN(height) || height <= 0 || height > 300)) {
      res.status(400).json({
        success: false,
        message: 'Height must be a positive number between 1 and 300 cm'
      });
      return;
    }
    
    if (age !== undefined && (isNaN(age) || age < 13 || age > 120)) {
      res.status(400).json({
        success: false,
        message: 'Age must be a number between 13 and 120 years'
      });
      return;
    }

    // Prepare the update object with only fields that are provided
    const updateData: any = {};
    if (height !== undefined) updateData.height = height;
    if (age !== undefined) updateData.age = age;
    if (firstName) updateData.firstName = firstName;
    if (lastName) updateData.lastName = lastName;
    if (bio !== undefined) updateData.bio = bio;
    
    // Add weight to the update data, but also track it in the weight history collection
    if (weight !== undefined) {
      updateData.weight = weight;
      
      // Record weight in the weight history collection
      try {
        await WeightHistory.create({
          user: req.user._id,
          weight: weight,
          date: new Date()
        });
        console.log(`Recorded weight history entry for user ${req.user._id}: ${weight}kg`);
      } catch (weightHistoryError) {
        console.error('Error recording weight history:', weightHistoryError);
        // Continue even if weight history recording fails
      }
    }

    // Update user profile
    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      { $set: updateData },
      { new: true, runValidators: true }
    ).select('-password');

    if (!updatedUser) {
      res.status(404).json({
        success: false,
        message: 'User not found'
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: updatedUser
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating profile'
    });
  }
};

// Add a specific weight entry without updating the current profile weight
export const addWeightEntry = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
      return;
    }

    const { weight, date, note } = req.body;
    
    // Validate weight
    if (!weight || isNaN(weight) || weight <= 0 || weight > 300) {
      res.status(400).json({
        success: false,
        message: 'Weight must be a positive number between 1 and 300 kg'
      });
      return;
    }
    
    // Create a new weight history entry
    const weightEntry = await WeightHistory.create({
      user: req.user._id,
      weight,
      date: date ? new Date(date) : new Date(),
      note: note || ''
    });
    
    // Also update the current weight on the user profile
    await User.findByIdAndUpdate(
      req.user._id,
      { $set: { weight } }
    );
    
    res.status(201).json({
      success: true,
      message: 'Weight entry added successfully',
      data: weightEntry
    });
  } catch (error) {
    console.error('Add weight entry error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while adding weight entry'
    });
  }
};

// Get weight history for the current user
export const getWeightHistory = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
      return;
    }
    
    // Extract query parameters for date filtering
    const { startDate, endDate, limit = 100 } = req.query;
    
    // Build query
    const query: any = { user: req.user._id };
    
    if (startDate || endDate) {
      query.date = {};
      if (startDate) {
        query.date.$gte = new Date(startDate as string);
      }
      if (endDate) {
        query.date.$lte = new Date(endDate as string);
      }
    }
    
    // Get weight history entries
    const weightEntries = await WeightHistory.find(query)
      .sort({ date: -1 })
      .limit(parseInt(limit as string))
      .select('weight date note createdAt');
    
    res.status(200).json({
      success: true,
      count: weightEntries.length,
      data: weightEntries
    });
  } catch (error) {
    console.error('Get weight history error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching weight history'
    });
  }
};

// Update profile picture controller
export const updateProfilePicture = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
      return;
    }

    if (!req.file) {
      res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
      return;
    }

    // Get the file path relative to server
    const userId = req.user._id.toString();
    const relativeFilePath = `/uploads/profilepic/${userId}/${req.file.filename}`;
    const absoluteFilePath = req.file.path;

    // Get the old profile picture path to delete later
    const user = await User.findById(userId);
    const oldProfilePicture = user?.profilePicture;

    // Update user's profile picture path in database
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { 
        $set: { 
          profilePicture: relativeFilePath 
        } 
      },
      { new: true, runValidators: true }
    ).select('-password');

    if (!updatedUser) {
      // If update fails, delete the uploaded file
      fs.unlinkSync(absoluteFilePath);
      
      res.status(404).json({
        success: false,
        message: 'User not found'
      });
      return;
    }

    // Delete old profile picture if it exists
    if (oldProfilePicture) {
      const oldFilePath = path.join(__dirname, '../..', oldProfilePicture);
      try {
        if (fs.existsSync(oldFilePath)) {
          fs.unlinkSync(oldFilePath);
        }
      } catch (error) {
        console.error('Error deleting old profile picture:', error);
        // Continue even if delete fails
      }
    }

    res.status(200).json({
      success: true,
      message: 'Profile picture updated successfully',
      data: {
        user: updatedUser,
        profilePicture: relativeFilePath
      }
    });
  } catch (error) {
    console.error('Update profile picture error:', error);
    
    // If there was an error, try to delete the uploaded file
    if (req.file && req.file.path) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (deleteError) {
        console.error('Error deleting file after failed update:', deleteError);
      }
    }
    
    res.status(500).json({
      success: false,
      message: 'Server error while updating profile picture'
    });
  }
};

export const adminLogin = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ success: false, message: 'Please provide email and password' });
      return;
    }

    // Check if user exists
    const user = await User.findOne({ email }) as IUser | null;
    if (!user) {
      res.status(401).json({ success: false, message: 'Invalid credentials' });
      return;
    }

    // Verify password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      res.status(401).json({ success: false, message: 'Invalid credentials' });
      return;
    }

    // Check if user is an admin
    if (user.role !== 'ADMIN') {
      res.status(403).json({ success: false, message: 'Access denied: Admin privileges required' });
      return;
    }
    // User is valid and has admin privileges, generate token
    const token = generateToken(user._id!.toString());

    res.status(200).json({
      success: true,
      message: 'Admin login successful',
      data: {
        token,
        user: {
          id: user._id,
          username: user.username,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          profilePicture: user.profilePicture
        }
      }
    });
  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({ success: false, message: 'Server error during admin login' });
  }
};

// Update user privacy settings
export const updatePrivacySettings = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
      return;
    }

    const { privacyDefault, distanceUnit, paceUnit } = req.body;
    
    // Validate privacy settings
    if (privacyDefault && !['public', 'followers', 'private'].includes(privacyDefault)) {
      res.status(400).json({
        success: false,
        message: 'Invalid privacy setting. Must be "public", "followers", or "private"'
      });
      return;
    }
    
    // Validate distance unit
    if (distanceUnit && !['km', 'miles'].includes(distanceUnit)) {
      res.status(400).json({
        success: false,
        message: 'Invalid distance unit. Must be "km" or "miles"'
      });
      return;
    }
    
    // Validate pace unit
    if (paceUnit && !['min/km', 'min/mile'].includes(paceUnit)) {
      res.status(400).json({
        success: false,
        message: 'Invalid pace unit. Must be "min/km" or "min/mile"'
      });
      return;
    }

    // Prepare the update object with only fields that are provided
    const updateData: any = { activityPreferences: {} };
    
    // Only include fields that were actually provided in the request
    if (privacyDefault) updateData.activityPreferences.privacyDefault = privacyDefault;
    if (distanceUnit) updateData.activityPreferences.distanceUnit = distanceUnit;
    if (paceUnit) updateData.activityPreferences.paceUnit = paceUnit;

    // Update user preferences
    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      { $set: updateData },
      { new: true, runValidators: true }
    ).select('-password');

    if (!updatedUser) {
      res.status(404).json({
        success: false,
        message: 'User not found'
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'Privacy settings updated successfully',
      data: {
        activityPreferences: updatedUser.activityPreferences
      }
    });
  } catch (error) {
    console.error('Update privacy settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating privacy settings'
    });
  }
};

// Recalculate user total distance based on all activities
export const recalculateUserTotalDistance = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
      return;
    }

    // Get the user's ID
    const userId = req.user._id;
    console.log(`Recalculating total distance for user: ${userId}`);

    // Sum all distances from activities
    const result = await Activity.aggregate([
      { 
        $match: { 
          user: new mongoose.Types.ObjectId(userId.toString())
        } 
      },
      {
        $group: {
          _id: null,
          totalDistance: { $sum: '$distance' }
        }
      }
    ]);

    // Get the total distance or default to 0
    let totalDistance = result.length > 0 ? result[0].totalDistance : 0;
    
    // Check if values are likely in kilometers instead of meters
    if (totalDistance < 100) {  // If less than 100 meters, likely the values are in km
      totalDistance = totalDistance * 1000;  // Convert to meters
      console.log(`Converting from km to meters: ${totalDistance} meters`);
    }
    
    console.log(`Final calculated total distance: ${totalDistance} meters`);

    // Update the user's totalDistance field
    await User.findByIdAndUpdate(
      userId,
      { $set: { totalDistance: totalDistance } }
    );

    // Return success response
    res.status(200).json({
      success: true,
      message: 'Total distance recalculated successfully',
      data: {
        totalDistance: totalDistance,
        totalDistanceKm: (totalDistance / 1000).toFixed(2)
      }
    });
  } catch (error) {
    console.error('Recalculate total distance error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while recalculating total distance'
    });
  }
};



