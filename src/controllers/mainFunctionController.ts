import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { User, IUser } from '../config/database';
import { generateToken } from '../middleware/authMiddleware';
import mongoose from 'mongoose';

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
    if (weight !== undefined) updateData.weight = weight;
    if (height !== undefined) updateData.height = height;
    if (age !== undefined) updateData.age = age;
    if (firstName) updateData.firstName = firstName;
    if (lastName) updateData.lastName = lastName;
    if (bio !== undefined) updateData.bio = bio;

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
