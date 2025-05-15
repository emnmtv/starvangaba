import express from 'express';
import dotenv from 'dotenv';
import os from 'os';
import connectDB from './config/dbconnnection';
import mainRoutes from './routes/mainRoutes';
import path from 'path';
// Initialize environment variables
dotenv.config();

// Connect to database
connectDB();

const app = express();
const PORT = parseInt(process.env.PORT || '5000', 10);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Get server IP addresses
const getIpAddresses = () => {
  const interfaces = os.networkInterfaces();
  const ipAddresses: string[] = [];

  Object.keys(interfaces).forEach((interfaceName) => {
    const addresses = interfaces[interfaceName];
    if (addresses) {
      addresses.forEach((address) => {
        // Skip internal and non-IPv4 addresses
        if (!address.internal && address.family === 'IPv4') {
          ipAddresses.push(address.address);
        }
      });
    }
  });

  return ipAddresses;
};

// Routes
app.use('/api', mainRoutes);

// Basic route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Test route with map UI
app.get('/map', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  const ipAddresses = getIpAddresses();
  console.log(`Server running on port ${PORT}`);
  console.log(`Access locally via: http://localhost:${PORT}`);
  console.log('Access via IP:');
  ipAddresses.forEach(ip => {
    console.log(`http://${ip}:${PORT}`);
  });
});
