import mongoose, { Schema, Document, Model } from 'mongoose';
import { Point, LineString } from 'geojson';

// User interface
export interface IUser extends Document {
  username: string;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  role: 'USER' | 'ADMIN';
  profilePicture?: string;
  bio?: string;
  weight?: number; // Weight in kg
  height?: number; // Height in cm
  age?: number; // Age in years
  totalDistance?: number; // Total distance in meters
  routesCount?: number; // Count of routes created
  averagePace?: number; // Average pace in seconds per kilometer
  followers: mongoose.Types.ObjectId[];
  following: mongoose.Types.ObjectId[];
  activityPreferences: {
    privacyDefault: 'public' | 'followers' | 'private';
    distanceUnit: 'km' | 'miles';
    paceUnit: 'min/km' | 'min/mile';
  };
  createdAt: Date;
  updatedAt: Date;
}

// Weight history interface for tracking weight changes over time
export interface IWeightHistory extends Document {
  user: mongoose.Types.ObjectId;
  weight: number; // Weight in kg
  date: Date;
  note?: string; // Optional note about the weight entry
}

// Activity interface
export interface IActivity extends Document {
  user: mongoose.Types.ObjectId;
  type: 'run' | 'jog' | 'walk' | 'cycling' | 'hiking' | 'other';
  title: string;
  description?: string;
  startTime: Date;
  endTime: Date;
  duration: number; // in seconds
  distance: number; // in meters
  elevationGain: number; // in meters
  averageSpeed: number; // in m/s
  maxSpeed: number; // in m/s
  averagePace: number; // in seconds per kilometer
  calories: number;
  steps: number; // number of steps taken
  simulated: boolean; // indicates if the activity was simulated
  
  // Full route as LineString
  route: {
    type: string;
    coordinates: number[][];
  };
  
  // Array of timestamped location points for detailed analysis
  locationHistory: {
    timestamp: Date;
    location: {
      type: string;
      coordinates: number[]; // [longitude, latitude]
    };
    elevation?: number;
    speed?: number;
    heartRate?: number;
  }[];
  
  // Stats at each kilometer/mile
  splits: {
    distance: number;
    duration: number;
    pace: number;
  }[];
  
  weather?: {
    temperature: number;
    condition: string;
    humidity: number;
    windSpeed: number;
  };
  
  privacy: 'public' | 'followers' | 'private';
  likes: mongoose.Types.ObjectId[];
  comments: {
    user: mongoose.Types.ObjectId;
    text: string;
    createdAt: Date;
  }[];
  
  // Archive fields
  archived?: boolean;
  archivedAt?: Date;
  
  createdAt: Date;
  updatedAt: Date;
}

// Real-time tracking session interface
export interface IActiveSession extends Document {
  user: mongoose.Types.ObjectId;
  activity: mongoose.Types.ObjectId;
  startTime: Date;
  isActive: boolean;
  currentLocation: {
    type: string;
    coordinates: number[]; // [longitude, latitude]
  };
  currentSpeed: number;
  currentHeartRate?: number;
  currentElevation?: number;
  currentDistance: number;
  currentDuration: number;
  lastUpdated: Date;
}

// Challenge interface
export interface IChallenge extends Document {
  title: string;
  description: string;
  type: 'distance' | 'time' | 'elevation' | 'frequency';
  goal: number;
  startDate: Date;
  endDate: Date;
  participants: {
    user: mongoose.Types.ObjectId;
    progress: number;
    completed: boolean;
    completedDate?: Date;
  }[];
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

// Route interface (for saved/favorite routes)
export interface IRoute extends Document {
  title: string;
  description?: string;
  user: mongoose.Types.ObjectId;
  distance: number;
  elevationGain: number;
  startPoint: {
    type: string;
    coordinates: number[];
  };
  endPoint: {
    type: string;
    coordinates: number[];
  };
  path: {
    type: string;
    coordinates: number[][];
  };
  isPublic: boolean;
  usageCount: number;
  completed: boolean;
  isVerified: boolean; // Whether the route is verified by an admin
  verifiedBy?: mongoose.Types.ObjectId; // Admin who verified the route
  verificationDate?: Date; // Date when the route was verified
  createdAt: Date;
  updatedAt: Date;
}

// User Schema
const UserSchema: Schema = new Schema({
  username: { type: String, required: true, unique: true, trim: true },
  firstName: { type: String, required: true, trim: true },
  lastName: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, trim: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['USER', 'ADMIN'], default: 'USER' },
  profilePicture: { type: String },
  bio: { type: String },
  weight: { type: Number }, // Weight in kg
  height: { type: Number }, // Height in cm
  age: { type: Number }, // Age in years
  totalDistance: { type: Number, default: 0 }, // Total distance in meters
  routesCount: { type: Number, default: 0 }, // Count of routes created
  averagePace: { type: Number }, // Average pace in seconds per kilometer
  followers: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  following: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  activityPreferences: {
    privacyDefault: { type: String, enum: ['public', 'followers', 'private'], default: 'public' },
    distanceUnit: { type: String, enum: ['km', 'miles'], default: 'km' },
    paceUnit: { type: String, enum: ['min/km', 'min/mile'], default: 'min/km' }
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, {
  timestamps: true
});

// Weight History Schema
const WeightHistorySchema: Schema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  weight: { type: Number, required: true }, // Weight in kg
  date: { type: Date, default: Date.now, index: true },
  note: { type: String }
}, {
  timestamps: true
});

// Activity Schema with GeoJSON support
const ActivitySchema: Schema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type: { 
    type: String, 
    enum: ['run', 'jog', 'walk', 'cycling', 'hiking', 'other'], 
    required: true,
    index: true
  },
  title: { type: String, required: true },
  description: { type: String },
  startTime: { type: Date, required: true, index: true },
  endTime: { type: Date, required: true },
  duration: { type: Number, required: true }, // in seconds
  distance: { type: Number, required: true }, // in meters
  elevationGain: { type: Number, default: 0 }, // in meters
  averageSpeed: { type: Number }, // in m/s
  maxSpeed: { type: Number }, // in m/s
  averagePace: { type: Number }, // in seconds per kilometer
  calories: { type: Number },
  steps: { type: Number, default: 0 }, // number of steps taken
  simulated: { type: Boolean, default: false }, // indicates if the activity was simulated
  
  // GeoJSON LineString for the complete route
  route: {
    type: { type: String, enum: ['LineString'], required: true },
    coordinates: { type: [[Number]], required: true }
  },
  
  // Array of location points with timestamps
  locationHistory: [{
    timestamp: { type: Date, required: true },
    location: {
      type: { type: String, enum: ['Point'], required: true },
      coordinates: { type: [Number], required: true } // [longitude, latitude]
    },
    elevation: Number,
    speed: Number,
    heartRate: Number
  }],
  
  // Split times
  splits: [{
    distance: Number,
    duration: Number,
    pace: Number
  }],
  
  weather: {
    temperature: Number,
    condition: String,
    humidity: Number,
    windSpeed: Number
  },
  
  privacy: { 
    type: String, 
    enum: ['public', 'followers', 'private'], 
    default: 'public' 
  },
  
  likes: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  
  comments: [{
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
  }],
  
  // Archive fields
  archived: { type: Boolean },
  archivedAt: { type: Date },
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, {
  timestamps: true
});

// Real-time tracking session Schema
const ActiveSessionSchema: Schema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  activity: { type: Schema.Types.ObjectId, ref: 'Activity' },
  startTime: { type: Date, required: true, default: Date.now },
  isActive: { type: Boolean, default: true },
  currentLocation: {
    type: { type: String, enum: ['Point'], required: true },
    coordinates: { type: [Number], required: true } // [longitude, latitude]
  },
  currentSpeed: { type: Number, default: 0 },
  currentHeartRate: { type: Number },
  currentElevation: { type: Number },
  currentDistance: { type: Number, default: 0 },
  currentDuration: { type: Number, default: 0 },
  lastUpdated: { type: Date, default: Date.now }
});

// Challenge Schema
const ChallengeSchema: Schema = new Schema({
  title: { type: String, required: true },
  description: { type: String, required: true },
  type: { 
    type: String, 
    enum: ['distance', 'time', 'elevation', 'frequency'], 
    required: true 
  },
  goal: { type: Number, required: true },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  participants: [{
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    progress: { type: Number, default: 0 },
    completed: { type: Boolean, default: false },
    completedDate: { type: Date }
  }],
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, {
  timestamps: true
});

// Route Schema (for saved routes)
const RouteSchema: Schema = new Schema({
  title: { type: String, required: true },
  description: { type: String },
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  distance: { type: Number, required: true },
  elevationGain: { type: Number, default: 0 },
  startPoint: {
    type: { type: String, enum: ['Point'], required: true },
    coordinates: { type: [Number], required: true }
  },
  endPoint: {
    type: { type: String, enum: ['Point'], required: true },
    coordinates: { type: [Number], required: true }
  },
  path: {
    type: { type: String, enum: ['LineString'], required: true },
    coordinates: { type: [[Number]], required: true }
  },
  isPublic: { type: Boolean, default: false },
  usageCount: { type: Number, default: 0 },
  completed: { type: Boolean, default: false },
  isVerified: { type: Boolean, default: false },
  verifiedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  verificationDate: { type: Date },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, {
  timestamps: true
});

// Create geospatial indexes
ActivitySchema.index({ 'route': '2dsphere' });
ActivitySchema.index({ 'locationHistory.location': '2dsphere' });
ActiveSessionSchema.index({ 'currentLocation': '2dsphere' });
RouteSchema.index({ 'path': '2dsphere' });
RouteSchema.index({ 'startPoint': '2dsphere' });
RouteSchema.index({ 'endPoint': '2dsphere' });

// Create models
export const User: Model<IUser> = mongoose.model<IUser>('User', UserSchema);
export const Activity: Model<IActivity> = mongoose.model<IActivity>('Activity', ActivitySchema);
export const ActiveSession: Model<IActiveSession> = mongoose.model<IActiveSession>('ActiveSession', ActiveSessionSchema);
export const Challenge: Model<IChallenge> = mongoose.model<IChallenge>('Challenge', ChallengeSchema);
export const Route: Model<IRoute> = mongoose.model<IRoute>('Route', RouteSchema);
export const WeightHistory: Model<IWeightHistory> = mongoose.model<IWeightHistory>('WeightHistory', WeightHistorySchema);

export default {
  User,
  Activity,
  ActiveSession,
  Challenge,
  Route,
  WeightHistory
};