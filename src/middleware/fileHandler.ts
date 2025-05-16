import multer, { FileFilterCallback } from 'multer';
import path from 'path';
import fs from 'fs';
import { Request } from 'express';

// Define storage configuration for profile pictures
const profilePictureStorage = multer.diskStorage({
  destination: function (req: Request, file: Express.Multer.File, cb: any) {
    // Create directory if it doesn't exist
    const userId = req.user?._id.toString();
    if (!userId) {
      return cb(new Error('User not authenticated'), '');
    }
    
    const uploadDir = path.join(__dirname, '../../uploads/profilepic', userId);
    
    // Ensure directory exists
    fs.mkdirSync(uploadDir, { recursive: true });
    
    cb(null, uploadDir);
  },
  
  filename: function (req: Request, file: Express.Multer.File, cb: any) {
    // Generate unique filename with timestamp
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const fileExt = path.extname(file.originalname);
    cb(null, 'profile-' + uniqueSuffix + fileExt);
  }
});

// File filter to only allow image files
const fileFilter = (req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
  // Accept only image files
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed!'));
  }
};

// Configure multer for profile picture uploads
export const uploadProfilePicture = multer({
  storage: profilePictureStorage,
  limits: {
    fileSize: 20 * 1024 * 1024, 
  },
  fileFilter
}).single('profilePicture'); // 'profilePicture' is the field name expected in the form data

// Need to extend the Express Request type to include the file
declare global {
  namespace Express {
    interface Request {
      file?: Express.Multer.File;
    }
    namespace Multer {
      interface File {
        fieldname: string;
        originalname: string;
        encoding: string;
        mimetype: string;
        size: number;
        destination: string;
        filename: string;
        path: string;
        buffer: Buffer;
      }
    }
  }
}
