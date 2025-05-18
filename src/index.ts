import express from 'express';
import dotenv from 'dotenv';
import os from 'os';
import connectDB from './config/dbconnnection';
import mainRoutes from './routes/mainRoutes';
import path from 'path';
import cors from 'cors';
import http from 'http';
import MapSocketServer from './websocket/mapSocketServer';

// Initialize environment variables
dotenv.config();

// Connect to database
connectDB();

const app = express();
const PORT = parseInt(process.env.PORT || '5500', 10);

// Create HTTP server (required for Socket.IO)
const server = http.createServer(app);

// Initialize Socket.IO server
const socketServer = new MapSocketServer(server);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }));
// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Serve uploaded files from uploads directory
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

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

// Socket.IO debug endpoint
app.get('/socket-status', (req, res) => {
  res.json({
    status: 'active',
    message: 'Socket.IO server is running',
    activeConnections: 'Connection count would be shown here in a production system'
  });
});

// Start server using the HTTP server instead of Express app
server.listen(PORT, '0.0.0.0', () => {
  const ipAddresses = getIpAddresses();
  console.log(`Server running on port ${PORT}`);
  console.log(`Socket.IO server initialized for live tracking on path: /socket.io`);
  console.log(`Access locally via: http://localhost:${PORT}`);
  console.log('Access via IP:');
  ipAddresses.forEach(ip => {
    console.log(`http://${ip}:${PORT}`);
  });
  console.log(`Socket.IO URL: http://localhost:${PORT}/socket.io`);
  ipAddresses.forEach(ip => {
    console.log(`Socket.IO IP: http://${ip}:${PORT}/socket.io`);
  });
});
