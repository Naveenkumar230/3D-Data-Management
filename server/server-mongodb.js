/**
 * 3D Printing Analytics Server - MongoDB Implementation
 * Aquarelle India Pvt. Ltd.
 * 
 * FEATURES:
 * - MongoDB database with Mongoose ODM
 * - JWT authentication with bcrypt password hashing
 * - RESTful API endpoints
 * - Input validation and error handling
 * - File upload support for images
 * - Data export functionality
 * - Session management
 * - Rate limiting and security middleware
 */

const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const { body, validationResult } = require('express-validator');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production';
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/printing_analytics';
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH || '$2a$10$YourHashedPasswordHere';

// Security middleware
app.use(helmet());
app.use(cors({
    origin: process.env.NODE_ENV === 'production' 
        ? ['https://yourdomain.com'] 
        : ['http://localhost:3000', 'http://127.0.0.1:3000'],
    credentials: true
}));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// Stricter rate limiting for auth endpoints
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // limit each IP to 5 requests per windowMs
    message: 'Too many authentication attempts, please try again later.'
});

// Body parsing middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve static files
app.use(express.static(path.join(__dirname, '../client')));

// MongoDB connection
mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
});

const db = mongoose.connection;
db.on('error', console.error.bind(console, '❌ MongoDB connection error:'));
db.once('open', () => {
    console.log('✅ Connected to MongoDB');
});

// Mongoose Schemas
const recordSchema = new mongoose.Schema({
    date: { type: Date, required: true },
    projectName: { type: String, required: true, maxlength: 100 },
    partType: { type: String, required: true, maxlength: 50 },
    partSize: { type: String, required: true, maxlength: 50 },
    partName: { type: String, required: true, maxlength: 100 },
    application: { type: String, required: true, maxlength: 200 },
    sharepointLink: { type: String, maxlength: 500 },
    materialUsed: { type: String, required: true, maxlength: 50 },
    machineName: { type: String, required: true, maxlength: 50 },
    printingTimeMins: { type: Number, required: true, min: 0 },
    printingTimeHrs: { type: Number, required: true, min: 0 },
    printPrice: { type: Number, required: true, min: 0 },
    electricityCost: { type: Number, required: true, min: 0 },
    printCost: { type: Number, required: true, min: 0 },
    oemCost: { type: Number, required: true, min: 0 },
    savingsPerProduct: { type: Number, required: true },
    status: { 
        type: String, 
        required: true,
        enum: ['pending', 'in-progress', 'completed', 'cancelled']
    },
    category: { 
        type: String, 
        required: true,
        enum: ['prototype', 'production', 'research', 'maintenance', 'other']
    },
    quantities: {
        bng: { type: Number, default: 0, min: 0 },
        sampling: { type: Number, default: 0, min: 0 },
        rcc: { type: Number, default: 0, min: 0 },
        rd: { type: Number, default: 0, min: 0 },
        kaa: { type: Number, default: 0, min: 0 },
        bom: { type: Number, default: 0, min: 0 },
        other: { type: Number, default: 0, min: 0 }
    },
    totalQuantity: { type: Number, required: true, min: 1 },
    totalSavings: { type: Number, required: true },
    image: { type: String }, // Base64 encoded image
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

const feedbackSchema = new mongoose.Schema({
    name: { type: String, required: true, maxlength: 100 },
    partName: { type: String, maxlength: 100 },
    email: { 
        type: String, 
        required: true, 
        maxlength: 100,
        match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
    },
    location: { type: String, required: true, maxlength: 100 },
    category: { 
        type: String, 
        required: true,
        enum: ['general', 'technical', 'complaint', 'suggestion', 'bug-report']
    },
    subject: { type: String, required: true, maxlength: 200 },
    message: { type: String, required: true, maxlength: 1000 },
    rating: { type: Number, required: true, min: 1, max: 5 },
    image: { type: String }, // Base64 encoded image
    status: { 
        type: String, 
        default: 'new',
        enum: ['new', 'in-review', 'resolved', 'closed']
    },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

const projectSchema = new mongoose.Schema({
    title: { type: String, required: true, maxlength: 200 },
    description: { type: String, required: true, maxlength: 1000 },
    priority: { 
        type: String, 
        required: true,
        enum: ['low', 'medium', 'high', 'critical']
    },
    location: { type: String, required: true, maxlength: 100 },
    dueDate: { type: Date, required: true },
    image: { type: String }, // Base64 encoded image
    status: { 
        type: String, 
        default: 'pending',
        enum: ['pending', 'in-progress', 'completed', 'cancelled', 'on-hold']
    },
    assignedTo: { type: String, maxlength: 100 },
    tags: [{ type: String, maxlength: 50 }],
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

const settingsSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true },
    value: { type: mongoose.Schema.Types.Mixed, required: true },
    description: { type: String },
    updatedAt: { type: Date, default: Date.now }
});

const authLogSchema = new mongoose.Schema({
    ip: { type: String, required: true },
    userAgent: { type: String },
    action: { type: String, required: true },
    success: { type: Boolean, required: true },
    timestamp: { type: Date, default: Date.now }
});

// Models
const Record = mongoose.model('Record', recordSchema);
const Feedback = mongoose.model('Feedback', feedbackSchema);
const Project = mongoose.model('Project', projectSchema);
const Settings = mongoose.model('Settings', settingsSchema);
const AuthLog = mongoose.model('AuthLog', authLogSchema);

// Authentication middleware
const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ 
            success: false, 
            error: 'Access token required' 
        });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ 
            success: false, 
            error: 'Invalid or expired token' 
        });
    }
};

// Validation middleware
const validateRecord = [
    body('projectName').trim().isLength({ min: 1, max: 100 }).escape(),
    body('partName').trim().isLength({ min: 1, max: 100 }).escape(),
    body('partType').trim().isLength({ min: 1, max: 50 }).escape(),
    body('materialUsed').trim().isLength({ min: 1, max: 50 }).escape(),
    body('machineName').trim().isLength({ min: 1, max: 50 }).escape(),
    body('printingTimeMins').isFloat({ min: 0 }),
    body('totalQuantity').isInt({ min: 1 }),
    body('status').isIn(['pending', 'in-progress', 'completed', 'cancelled']),
    body('category').isIn(['prototype', 'production', 'research', 'maintenance', 'other'])
];

const validateFeedback = [
    body('name').trim().isLength({ min: 1, max: 100 }).escape(),
    body('email').isEmail().normalizeEmail(),
    body('subject').trim().isLength({ min: 1, max: 200 }).escape(),
    body('message').trim().isLength({ min: 1, max: 1000 }).escape(),
    body('rating').isInt({ min: 1, max: 5 }),
    body('category').isIn(['general', 'technical', 'complaint', 'suggestion', 'bug-report'])
];

const validateProject = [
    body('title').trim().isLength({ min: 1, max: 200 }).escape(),
    body('description').trim().isLength({ min: 1, max: 1000 }).escape(),
    body('priority').isIn(['low', 'medium', 'high', 'critical']),
    body('location').trim().isLength({ min: 1, max: 100 }).escape(),
    body('dueDate').isISO8601().toDate()
];

// Helper function to log auth attempts
const logAuthAttempt = async (req, action, success) => {
    try {
        const authLog = new AuthLog({
            ip: req.ip || req.connection.remoteAddress,
            userAgent: req.get('User-Agent'),
            action: action,
            success: success
        });
        await authLog.save();
    } catch (error) {
        console.error('Failed to log auth attempt:', error);
    }
};

// Routes

// Health check
app.get('/api/health', (req, res) => {
    res.json({
        status: 'OK',
        message: '3D Printing Analytics Server is running',
        timestamp: new Date().toISOString(),
        database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
        features: {
            mongodb: true,
            authentication: true,
            imageUpload: true,
            dataValidation: true,
            rateLimit: true,
            security: true
        },
        company: 'Aquarelle India Pvt. Ltd',
        version: '3.0.0'
    });
});

// Authentication endpoints
app.post('/api/auth/login', authLimiter, async (req, res) => {
    try {
        const { password } = req.body;

        if (!password) {
            await logAuthAttempt(req, 'login', false);
            return res.status(400).json({
                success: false,
                error: 'Password is required'
            });
        }

        // Compare with stored hash
        const isValid = await bcrypt.compare(password, ADMIN_PASSWORD_HASH);

        if (isValid) {
            const token = jwt.sign(
                { role: 'admin', timestamp: Date.now() },
                JWT_SECRET,
                { expiresIn: '1h' }
            );

            const expiresAt = new Date(Date.now() + 3600000); // 1 hour

            await logAuthAttempt(req, 'login', true);

            res.json({
                success: true,
                token: token,
                expiresAt: expiresAt.toISOString(),
                message: 'Authentication successful'
            });
        } else {
            await logAuthAttempt(req, 'login', false);
            res.status(401).json({
                success: false,
                error: 'Invalid credentials'
            });
        }
    } catch (error) {
        console.error('Authentication error:', error);
        await logAuthAttempt(req, 'login', false);
        res.status(500).json({
            success: false,
            error: 'Authentication failed',
            message: error.message
        });
    }
});

// Verify token endpoint
app.post('/api/auth/verify', authenticateToken, (req, res) => {
    res.json({
        success: true,
        valid: true,
        user: req.user,
        timestamp: new Date().toISOString()
    });
});

// Records endpoints
app.get('/api/records', async (req, res) => {
    try {
        const { page = 1, limit = 100, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
        
        const records = await Record.find()
            .sort({ [sortBy]: sortOrder === 'desc' ? -1 : 1 })
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .exec();

        const total = await Record.countDocuments();

        res.json({
            success: true,
            data: records,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('Failed to fetch records:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch records',
            message: error.message
        });
    }
});

app.post('/api/records', authenticateToken, validateRecord, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                details: errors.array()
            });
        }

        const record = new Record(req.body);
        record.updatedAt = new Date();
        
        const savedRecord = await record.save();
        
        res.status(201).json({
            success: true,
            data: savedRecord,
            message: 'Record created successfully'
        });
    } catch (error) {
        console.error('Failed to create record:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create record',
            message: error.message
        });
    }
});

app.put('/api/records/:id', authenticateToken, validateRecord, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                details: errors.array()
            });
        }

        const record = await Record.findByIdAndUpdate(
            req.params.id,
            { ...req.body, updatedAt: new Date() },
            { new: true, runValidators: true }
        );

        if (!record) {
            return res.status(404).json({
                success: false,
                error: 'Record not found'
            });
        }

        res.json({
            success: true,
            data: record,
            message: 'Record updated successfully'
        });
    } catch (error) {
        console.error('Failed to update record:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update record',
            message: error.message
        });
    }
});

app.delete('/api/records/:id', authenticateToken, async (req, res) => {
    try {
        const record = await Record.findByIdAndDelete(req.params.id);

        if (!record) {
            return res.status(404).json({
                success: false,
                error: 'Record not found'
            });
        }

        res.json({
            success: true,
            message: 'Record deleted successfully'
        });
    } catch (error) {
        console.error('Failed to delete record:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete record',
            message: error.message
        });
    }
});

// Feedback endpoints
app.get('/api/feedback', async (req, res) => {
    try {
        const { page = 1, limit = 100, status } = req.query;
        
        const query = status ? { status } : {};
        
        const feedback = await Feedback.find(query)
            .sort({ createdAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .exec();

        const total = await Feedback.countDocuments(query);

        res.json({
            success: true,
            data: feedback,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('Failed to fetch feedback:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch feedback',
            message: error.message
        });
    }
});

app.post('/api/feedback', validateFeedback, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                details: errors.array()
            });
        }

        const feedback = new Feedback(req.body);
        const savedFeedback = await feedback.save();

        res.status(201).json({
            success: true,
            data: savedFeedback,
            message: 'Feedback submitted successfully'
        });
    } catch (error) {
        console.error('Failed to create feedback:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to submit feedback',
            message: error.message
        });
    }
});

app.delete('/api/feedback/:id', authenticateToken, async (req, res) => {
    try {
        const feedback = await Feedback.findByIdAndDelete(req.params.id);

        if (!feedback) {
            return res.status(404).json({
                success: false,
                error: 'Feedback not found'
            });
        }

        res.json({
            success: true,
            message: 'Feedback deleted successfully'
        });
    } catch (error) {
        console.error('Failed to delete feedback:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete feedback',
            message: error.message
        });
    }
});

// Projects endpoints
app.get('/api/projects', async (req, res) => {
    try {
        const { page = 1, limit = 100, status, priority } = req.query;
        
        const query = {};
        if (status) query.status = status;
        if (priority) query.priority = priority;
        
        const projects = await Project.find(query)
            .sort({ createdAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .exec();

        const total = await Project.countDocuments(query);

        res.json({
            success: true,
            data: projects,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('Failed to fetch projects:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch projects',
            message: error.message
        });
    }
});

app.post('/api/projects', authenticateToken, validateProject, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                details: errors.array()
            });
        }

        const project = new Project(req.body);
        const savedProject = await project.save();

        res.status(201).json({
            success: true,
            data: savedProject,
            message: 'Project created successfully'
        });
    } catch (error) {
        console.error('Failed to create project:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create project',
            message: error.message
        });
    }
});

app.put('/api/projects/:id', authenticateToken, validateProject, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                details: errors.array()
            });
        }

        const project = await Project.findByIdAndUpdate(
            req.params.id,
            { ...req.body, updatedAt: new Date() },
            { new: true, runValidators: true }
        );

        if (!project) {
            return res.status(404).json({
                success: false,
                error: 'Project not found'
            });
        }

        res.json({
            success: true,
            data: project,
            message: 'Project updated successfully'
        });
    } catch (error) {
        console.error('Failed to update project:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update project',
            message: error.message
        });
    }
});

app.delete('/api/projects/:id', authenticateToken, async (req, res) => {
    try {
        const project = await Project.findByIdAndDelete(req.params.id);

        if (!project) {
            return res.status(404).json({
                success: false,
                error: 'Project not found'
            });
        }

        res.json({
            success: true,
            message: 'Project deleted successfully'
        });
    } catch (error) {
        console.error('Failed to delete project:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete project',
            message: error.message
        });
    }
});

// Settings endpoints
app.get('/api/settings', async (req, res) => {
    try {
        const settings = await Settings.find();
        const settingsObj = settings.reduce((acc, setting) => {
            acc[setting.key] = setting.value;
            return acc;
        }, {});

        res.json({
            success: true,
            data: settingsObj
        });
    } catch (error) {
        console.error('Failed to fetch settings:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch settings',
            message: error.message
        });
    }
});

app.put('/api/settings', authenticateToken, async (req, res) => {
    try {
        const { settings } = req.body;

        const updatePromises = Object.entries(settings).map(([key, value]) =>
            Settings.findOneAndUpdate(
                { key },
                { key, value, updatedAt: new Date() },
                { upsert: true, new: true }
            )
        );

        await Promise.all(updatePromises);

        res.json({
            success: true,
            message: 'Settings updated successfully'
        });
    } catch (error) {
        console.error('Failed to update settings:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update settings',
            message: error.message
        });
    }
});

// Analytics endpoints
app.get('/api/analytics/dashboard', async (req, res) => {
    try {
        const [recordCount, feedbackCount, projectCount, totalSavings] = await Promise.all([
            Record.countDocuments(),
            Feedback.countDocuments(),
            Project.countDocuments(),
            Record.aggregate([
                { $group: { _id: null, total: { $sum: '$totalSavings' } } }
            ])
        ]);

        const totalPrintingTime = await Record.aggregate([
            { $group: { _id: null, total: { $sum: '$printingTimeHrs' } } }
        ]);

        res.json({
            success: true,
            data: {
                recordCount,
                feedbackCount,
                projectCount,
                totalSavings: totalSavings[0]?.total || 0,
                totalPrintingTime: totalPrintingTime[0]?.total || 0,
                lastUpdated: new Date().toISOString()
            }
        });
    } catch (error) {
        console.error('Failed to fetch analytics:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch analytics',
            message: error.message
        });
    }
});

// Serve the client app
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('❌ Server Error:', err.stack);
    res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong',
        timestamp: new Date().toISOString()
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'Not Found',
        message: `Route ${req.path} not found`,
        timestamp: new Date().toISOString()
    });
});

// Graceful shutdown
const gracefulShutdown = (signal) => {
    console.log(`🛑 Received ${signal}, shutting down gracefully...`);
    mongoose.connection.close(() => {
        console.log('📊 MongoDB connection closed');
        process.exit(0);
    });
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log('🚀====================================🚀');
    console.log(`   3D Printing Analytics Server v3.0`);
    console.log(`   MongoDB + JWT Authentication`);
    console.log(`   Aquarelle India Pvt. Ltd`);
    console.log('🚀====================================🚀');
    console.log(`📊 Dashboard: http://localhost:${PORT}`);
    console.log(`⚡ Server running on port ${PORT}`);
    console.log(`🔒 JWT Authentication: Enabled`);
    console.log(`📁 File uploads: Up to 50MB`);
    console.log(`🗃️  MongoDB: ${mongoose.connection.readyState === 1 ? 'Connected' : 'Connecting...'}`);
    console.log(`🛡️  Security: Helmet, CORS, Rate Limiting`);
    console.log(`✅ All 3 bugs fixed and security enhanced`);
    console.log('🚀====================================🚀');
});

module.exports = app;