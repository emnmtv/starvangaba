import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import { User } from '../config/database';
import connectDB from '../config/dbconnnection';

// Default admin credentials - CHANGE THESE IN PRODUCTION
const DEFAULT_ADMIN = {
  username: 'admin',
  email: 'admin@starvangaba.com',
  password: 'admin123456', // This should be changed immediately after first login
  firstName: 'Admin',
  lastName: 'User',
};

async function seedAdmin() {
  try {
    // Connect to MongoDB using the existing connection function
    console.log('Connecting to MongoDB...');
    await connectDB();
    console.log('Connected to MongoDB successfully!');

    // Check if admin user already exists
    const existingAdmin = await User.findOne({
      $or: [
        { email: DEFAULT_ADMIN.email },
        { username: DEFAULT_ADMIN.username, role: 'ADMIN' }
      ]
    });

    if (existingAdmin) {
      console.log('Admin user already exists!');
      console.log(`Username: ${existingAdmin.username}`);
      console.log(`Email: ${existingAdmin.email}`);
      await mongoose.disconnect();
      return;
    }

    // Check if user exists but is not admin
    const existingUser = await User.findOne({ 
      $or: [
        { email: DEFAULT_ADMIN.email },
        { username: DEFAULT_ADMIN.username }
      ]
    });

    if (existingUser) {
      // Update to admin role
      existingUser.role = 'ADMIN';
      await existingUser.save();
      
      console.log('Existing user updated to admin:');
      console.log(`Username: ${existingUser.username}`);
      console.log(`Email: ${existingUser.email}`);
      console.log(`Role: ${existingUser.role}`);
      await mongoose.disconnect();
      return;
    }

    // Create new admin user
    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(DEFAULT_ADMIN.password, salt);

    // Create admin user
    const adminUser = await User.create({
      username: DEFAULT_ADMIN.username,
      email: DEFAULT_ADMIN.email,
      password: hashedPassword,
      firstName: DEFAULT_ADMIN.firstName,
      lastName: DEFAULT_ADMIN.lastName,
      role: 'ADMIN',
      activityPreferences: {
        privacyDefault: 'public',
        distanceUnit: 'km',
        paceUnit: 'min/km'
      }
    });

    console.log('Admin user created successfully:');
    console.log(`Username: ${adminUser.username}`);
    console.log(`Email: ${adminUser.email}`);
    console.log(`Password: ${DEFAULT_ADMIN.password} (CHANGE THIS IMMEDIATELY!)`);

    // Disconnect from MongoDB
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');

  } catch (error) {
    console.error('Error seeding admin user:', error);
    process.exit(1);
  }
}

// Run the seed function
seedAdmin(); 