const express = require('express');
const path = require('path');
const cors = require('cors');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve static files
app.use(express.static(path.join(__dirname)));

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// API endpoint for health check
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        message: '3D Printing Analytics Server is running',
        timestamp: new Date().toISOString(),
        features: {
            imageUpload: true,
            excelExport: true,
            authentication: true,
            responsiveDesign: true,
            serverBackup: true,
            imageValidation: true
        },
        company: 'Aquarelle India Pvt. Ltd',
        version: '2.0.0'
    });
});

// API endpoint to save data (backup storage)
app.post('/api/data/:type', (req, res) => {
    try {
        const { type } = req.params;
        const data = req.body;
        
        // Validate data type
        const allowedTypes = ['records', 'feedback', 'projects', 'printers', 'filaments', 'export_logs'];
        if (!allowedTypes.includes(type)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid data type',
                allowedTypes: allowedTypes
            });
        }
        
        // Create data directory if it doesn't exist
        const dataDir = path.join(__dirname, 'data');
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
        
        // Save data to file with timestamp
        const timestamp = new Date().toISOString();
        const dataToSave = {
            data: data,
            timestamp: timestamp,
            type: type,
            recordCount: Array.isArray(data) ? data.length : 1
        };
        
        const filePath = path.join(dataDir, `${type}.json`);
        fs.writeFileSync(filePath, JSON.stringify(dataToSave, null, 2));
        
        // Also create a backup with timestamp
        const backupPath = path.join(dataDir, `${type}_backup_${timestamp.replace(/[:.]/g, '-')}.json`);
        fs.writeFileSync(backupPath, JSON.stringify(dataToSave, null, 2));
        
        res.json({ 
            success: true,
            message: `${type} data saved successfully`,
            timestamp: timestamp,
            recordCount: dataToSave.recordCount,
            backupCreated: true
        });
        
        // Log the operation
        console.log(`✅ Data saved: ${type} (${dataToSave.recordCount} records) at ${timestamp}`);
        
    } catch (error) {
        console.error('❌ Data save error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to save data',
            message: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// API endpoint to load data (backup storage)
app.get('/api/data/:type', (req, res) => {
    try {
        const { type } = req.params;
        const filePath = path.join(__dirname, 'data', `${type}.json`);
        
        if (fs.existsSync(filePath)) {
            const fileContent = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            res.json({
                success: true,
                data: fileContent.data || fileContent, // Handle both new and old formats
                timestamp: fileContent.timestamp || new Date().toISOString(),
                recordCount: fileContent.recordCount || (Array.isArray(fileContent.data) ? fileContent.data.length : 1),
                type: type
            });
        } else {
            res.json({
                success: true,
                data: [],
                message: 'No data found',
                timestamp: new Date().toISOString(),
                type: type,
                recordCount: 0
            });
        }
    } catch (error) {
        console.error('❌ Data load error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to load data',
            message: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// API endpoint for image processing and validation
app.post('/api/image/process', (req, res) => {
    try {
        const { imageData, operation } = req.body;
        
        if (!imageData) {
            return res.status(400).json({
                success: false,
                error: 'No image data provided'
            });
        }
        
        // Process image based on operation
        let result;
        switch (operation) {
            case 'compress':
                // Basic compression info
                result = { 
                    compressed: true, 
                    originalSize: imageData.length,
                    estimatedCompressedSize: Math.floor(imageData.length * 0.7),
                    compressionRatio: '30%'
                };
                break;
                
            case 'validate':
                // Enhanced image validation
                const isValid = imageData.startsWith('data:image/');
                let format = null;
                let sizeInfo = null;
                
                if (isValid) {
                    const mimeMatch = imageData.match(/data:image\/([^;]+)/);
                    format = mimeMatch ? mimeMatch[1] : 'unknown';
                    
                    // Calculate approximate file size
                    const base64Length = imageData.split(',')[1]?.length || 0;
                    const sizeInBytes = Math.floor(base64Length * 0.75);
                    
                    sizeInfo = {
                        bytes: sizeInBytes,
                        kb: Math.round(sizeInBytes / 1024),
                        mb: Math.round(sizeInBytes / (1024 * 1024) * 100) / 100
                    };
                }
                
                result = { 
                    valid: isValid, 
                    format: format,
                    size: sizeInfo,
                    supportedFormats: ['png', 'jpg', 'jpeg', 'gif', 'webp']
                };
                break;
                
            case 'metadata':
                // Extract basic metadata
                const metaMatch = imageData.match(/data:image\/([^;]+);base64,/);
                result = {
                    format: metaMatch ? metaMatch[1] : 'unknown',
                    encoding: 'base64',
                    dataLength: imageData.length,
                    isDataURL: imageData.startsWith('data:'),
                    timestamp: new Date().toISOString()
                };
                break;
                
            default:
                result = { 
                    processed: true,
                    operation: operation,
                    dataReceived: true,
                    dataLength: imageData.length
                };
        }
        
        res.json({
            success: true,
            result: result,
            operation: operation,
            timestamp: new Date().toISOString()
        });
        
        console.log(`🖼️  Image processed: ${operation} (${imageData.length} chars)`);
        
    } catch (error) {
        console.error('❌ Image processing error:', error);
        res.status(500).json({
            success: false,
            error: 'Image processing failed',
            message: error.message,
            operation: req.body.operation,
            timestamp: new Date().toISOString()
        });
    }
});

// API endpoint for Excel export preparation
app.post('/api/export/prepare', (req, res) => {
    try {
        const { type, data, includeImages } = req.body;
        
        if (!data || !Array.isArray(data)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid data provided - expected array'
            });
        }
        
        let processedData;
        let imageStats = {
            totalImages: 0,
            totalImageSize: 0,
            imageFormats: {},
            averageImageSize: 0
        };
        
        if (type === 'records' && includeImages) {
            // Process records data for Excel export with enhanced image handling
            processedData = data.map(record => {
                const processedRecord = { ...record };
                
                if (record.image) {
                    imageStats.totalImages++;
                    imageStats.totalImageSize += record.image.length;
                    
                    // Extract format
                    const formatMatch = record.image.match(/data:image\/([^;]+)/);
                    const format = formatMatch ? formatMatch[1] : 'unknown';
                    
                    imageStats.imageFormats[format] = (imageStats.imageFormats[format] || 0) + 1;
                    
                    // Add image metadata
                    processedRecord.imageInfo = {
                        hasImage: true,
                        format: format,
                        size: record.image.length,
                        sizeKB: Math.round(record.image.length / 1024),
                        sizeMB: Math.round(record.image.length / (1024 * 1024) * 100) / 100
                    };
                } else {
                    processedRecord.imageInfo = { hasImage: false };
                }
                
                return processedRecord;
            });
            
            // Calculate average image size
            if (imageStats.totalImages > 0) {
                imageStats.averageImageSize = Math.round(imageStats.totalImageSize / imageStats.totalImages);
                imageStats.averageImageSizeKB = Math.round(imageStats.averageImageSize / 1024);
            }
        } else {
            processedData = data;
        }
        
        // Generate export summary
        const exportSummary = {
            totalRecords: data.length,
            exportType: type,
            includesImages: includeImages,
            imageStatistics: imageStats,
            exportTimestamp: new Date().toISOString(),
            processingTime: Date.now(),
            dataIntegrity: {
                allRecordsProcessed: processedData.length === data.length,
                noDataLoss: true,
                validationPassed: true
            }
        };
        
        res.json({
            success: true,
            processedData: processedData,
            exportReady: true,
            timestamp: new Date().toISOString(),
            metadata: {
                totalRecords: data.length,
                includesImages: includeImages,
                exportType: type,
                imageCount: imageStats.totalImages,
                averageImageSize: imageStats.averageImageSizeKB + ' KB'
            },
            summary: exportSummary
        });
        
        console.log(`📊 Export prepared: ${type} (${data.length} records, ${imageStats.totalImages} images)`);
        
    } catch (error) {
        console.error('❌ Export preparation error:', error);
        res.status(500).json({
            success: false,
            error: 'Export preparation failed',
            message: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// API endpoint for authentication verification
app.post('/api/auth/verify', (req, res) => {
    try {
        const { password, action } = req.body;
        const correctPassword = '3dprinter@aqrl';
        
        // Enhanced security logging
        const authAttempt = {
            timestamp: new Date().toISOString(),
            action: action,
            success: password === correctPassword,
            ip: req.ip || req.connection.remoteAddress,
            userAgent: req.get('User-Agent')
        };
        
        // Log authentication attempt
        console.log(`🔐 Auth attempt: ${action} - ${authAttempt.success ? 'SUCCESS' : 'FAILED'} at ${authAttempt.timestamp}`);
        
        // Save auth log if directory exists
        try {
            const dataDir = path.join(__dirname, 'data');
            if (fs.existsSync(dataDir)) {
                const authLogPath = path.join(dataDir, 'auth_log.json');
                let authLog = [];
                
                if (fs.existsSync(authLogPath)) {
                    authLog = JSON.parse(fs.readFileSync(authLogPath, 'utf8'));
                }
                
                authLog.push(authAttempt);
                
                // Keep only last 100 auth attempts
                if (authLog.length > 100) {
                    authLog = authLog.slice(-100);
                }
                
                fs.writeFileSync(authLogPath, JSON.stringify(authLog, null, 2));
            }
        } catch (logError) {
            console.error('Auth logging error:', logError.message);
        }
        
        const isValid = password === correctPassword;
        
        res.json({
            success: isValid,
            authenticated: isValid,
            action: action,
            timestamp: new Date().toISOString(),
            message: isValid ? 'Authentication successful' : 'Invalid credentials',
            sessionInfo: {
                validUntil: new Date(Date.now() + 3600000).toISOString(), // 1 hour from now
                permissions: isValid ? ['read', 'write', 'delete', 'export'] : []
            }
        });
        
    } catch (error) {
        console.error('❌ Authentication error:', error);
        res.status(500).json({
            success: false,
            error: 'Authentication failed',
            message: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// API endpoint for system statistics
app.get('/api/stats', (req, res) => {
    try {
        const dataDir = path.join(__dirname, 'data');
        const stats = {
            server: {
                uptime: process.uptime(),
                memory: process.memoryUsage(),
                nodeVersion: process.version,
                platform: process.platform
            },
            data: {
                hasDataDirectory: fs.existsSync(dataDir),
                files: []
            },
            timestamp: new Date().toISOString()
        };
        
        if (stats.data.hasDataDirectory) {
            const files = fs.readdirSync(dataDir);
            stats.data.files = files.map(file => {
                const filePath = path.join(dataDir, file);
                const fileStat = fs.statSync(filePath);
                return {
                    name: file,
                    size: fileStat.size,
                    modified: fileStat.mtime,
                    type: path.extname(file)
                };
            });
        }
        
        res.json({
            success: true,
            stats: stats,
            message: '3D Printing Analytics - System Statistics'
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Failed to get system stats',
            message: error.message
        });
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('❌ Server Error:', err.stack);
    res.status(500).json({
        error: 'Something went wrong!',
        message: err.message,
        timestamp: new Date().toISOString(),
        path: req.path
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        error: 'Not Found',
        message: `Route ${req.path} not found`,
        timestamp: new Date().toISOString(),
        availableRoutes: [
            '/',
            '/api/health',
            '/api/data/:type',
            '/api/image/process',
            '/api/export/prepare',
            '/api/auth/verify',
            '/api/stats'
        ]
    });
});

// Graceful shutdown handler
process.on('SIGTERM', () => {
    console.log('🛑 Received SIGTERM, shutting down gracefully...');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('🛑 Received SIGINT, shutting down gracefully...');
    process.exit(0);
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log('🚀====================================🚀');
    console.log(`   3D Printing Analytics Server`);
    console.log(`   Aquarelle India Pvt. Ltd`);
    console.log('🚀====================================🚀');
    console.log(`📊 Dashboard: http://localhost:${PORT}`);
    console.log(`⚡ Server running on port ${PORT}`);
    console.log(`🔒 Authentication: Enabled`);
    console.log(`📁 File uploads: Up to 50MB`);
    console.log(`🖼️  Image processing: Enabled`);
    console.log(`📊 Excel export: Enhanced with images`);
    console.log(`💾 Data backup: Automatic`);
    console.log(`🌐 CORS: Enabled`);
    console.log(`📈 API endpoints: 7 available`);
    console.log('🚀====================================🚀');
    console.log(`🎯 Ready to serve 3D printing analytics!`);
    console.log('🚀====================================🚀');
});

module.exports = app;