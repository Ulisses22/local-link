const { app, BrowserWindow, Menu } = require('electron');
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');
const winston = require('winston');
const os = require('os');
const QRCode = require('qrcode');

// Initialize Express
const expressApp = express();
const server = http.createServer(expressApp);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Serve static files
expressApp.use(express.static('public'));

// DO NOT use this code in production.
// It is recommended to implement JWT (JSON Web Token) for better security.
let authorizedCode = "12345";

let connectedClients = {}; // Store connected devices

// Function to get local machine's IP
function getLocalIP() {
    const networkInterfaces = os.networkInterfaces();
    for (const interfaceName in networkInterfaces) {
        for (const networkInterface of networkInterfaces[interfaceName]) {
            if (networkInterface.family === 'IPv4' && !networkInterface.internal) {
                return networkInterface.address;
            }
        }
    }
    return 'localhost'; 
}

const LOCAL_IP = getLocalIP(); 

// Logger configuration
const logger = winston.createLogger({
    level: 'info',
    transports: [
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.timestamp(),
                winston.format.printf(info => `${info.timestamp} ${info.level}: ${info.message}`)
            )
        }),
        new winston.transports.File({
            filename: 'logs/server.log',
            level: 'info',
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.printf(info => `${info.timestamp} ${info.level}: ${info.message}`)
            )
        })
    ]
});

// Socket.IO connection management
io.on('connection', (socket) => {
    logger.info(`New device connected: ${socket.id}`);
    
    // Get device info from user-agent
    const userAgent = socket.request.headers['user-agent'];
    const deviceInfo = {
        id: socket.id,
        os: getOS(userAgent),
        icon: getRandomIcon(),
        name: getRandomNickname()
    };

    // Generate QR code with local IP
    QRCode.toDataURL(`http://${LOCAL_IP}:3000`, (err, url) => {
        if (err) {
            logger.error('Error generating QR Code:', err);
        } else {
            logger.info(`QR Code generated successfully for: http://${LOCAL_IP}:3000`);
            socket.emit('qr-code', url);
            socket.emit('link', `http://${LOCAL_IP}:3000`);
        }
    });

    // Authentication with code
    socket.on('authenticate', (code) => {
        if (code === authorizedCode) {
            socket.emit('authenticated', true); 
            connectedClients[socket.id] = deviceInfo; 
            logger.info(`Device authenticated: ${socket.id}, ${deviceInfo.name} (${deviceInfo.os})`);
            io.emit('update-connected-clients', connectedClients);
        } else {
            socket.emit('authenticated', false); 
            logger.warn(`Invalid code provided by ${socket.id}`);
        }
    });

    // Send file to other connected devices
    socket.on('send-file', (data) => {
        logger.info(`File sent from ${socket.id} to other devices.`);
        socket.broadcast.emit('receive-file', data);
    });

    // Device disconnects
    socket.on('disconnect', () => {
        logger.info(`Device disconnected: ${socket.id}`);
        delete connectedClients[socket.id]; 

        // Update other clients with the new list of connected devices
        io.emit('update-connected-clients', connectedClients);
    });
});

// Helper functions
function getOS(userAgent) {
    if (/Windows NT/i.test(userAgent)) return 'Windows';
    if (/Macintosh/i.test(userAgent)) return 'Mac';
    if (/Android/i.test(userAgent)) return 'Android';
    if (/iPhone|iPad|iPod/i.test(userAgent)) return 'iOS';
    return 'Unknown';
}

function getRandomIcon() {
    const icons = ['🐱', '🐈', '😸', '😻', '😼'];
    return icons[Math.floor(Math.random() * icons.length)];
}

function getRandomNickname() {
    const nicknames = ['WizardPotter'];
    return nicknames[Math.floor(Math.random() * nicknames.length)];
}

// Function to create the Electron window
function createWindow() {
    const win = new BrowserWindow({
        width: 800,
        height: 600,
        minWidth: 600,
        minHeight: 650,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            webSecurity: false,
        }
    });

    win.loadURL(`http://${LOCAL_IP}:3000`);
}

// Event listener when Electron is ready
app.whenReady().then(() => {
    createWindow();

    // Disable the menu
    Menu.setApplicationMenu(null);

    // Start the HTTP server
    const PORT = 3000;
    server.listen(PORT, LOCAL_IP, () => {
        logger.info(`Server running at ${LOCAL_IP}:${PORT}`);
    });
});

// Close the application when all windows are closed
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
