import express from "express"
import dotenv from "dotenv"
import mongoose from "mongoose"
import path from "path"
import { fileURLToPath } from "url"

// Import middleware
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js"
import { handleUploadError } from "./middleware/fileUpload.js"
import { sanitizeInput } from "./middleware/validation.js"
import { corsMiddleware, corsErrorHandler } from "./middleware/cors.js"
import {
  securityHeaders,
  mongoSanitization,
  requestSizeLimit,
  ipFilter,
  securityLogger,
} from "./middleware/security.js"
// import { generalLimiter } from './middleware/rateLimit.js';

// Import routes
import userRoutes from "./routes/user.js"
import imageryRoutes from "./routes/imagery.js"
import segmentRoutes from "./routes/segment.js"
// import segmentRoutes from './routes/segment.js';
import heightRoutes from "./routes/height.js"
import predictRoutes from "./routes/predict.js"
import alertsRoutes from "./routes/alerts.js"
import deforestationRoutes from "./routes/deforestation.js"
import mapdataRoutes from "./routes/mapdata.js"
import reportsRoutes from "./routes/reports.js"

// Load environment variables
dotenv.config()

const app = express()
const PORT = process.env.PORT || 5000

// Get the directory name
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Trust proxy (for rate limiting and IP detection)
app.set("trust proxy", 1)

// Security middleware (apply early)
app.use(securityHeaders)
app.use(securityLogger)
app.use(ipFilter)
app.use(requestSizeLimit)

// CORS
app.use(corsMiddleware)
app.use(corsErrorHandler)

// Rate limiting
// app.use(generalLimiter);

// Body parsing middleware
app.use(express.json({ limit: "50mb" }))
app.use(express.urlencoded({ extended: true, limit: "50mb" }))

// MongoDB injection prevention
app.use(mongoSanitization)

// Input sanitization
app.use(sanitizeInput)

// Serve static files from backend/public
app.use(express.static(path.join(__dirname, "public")))

// Connect to MongoDB
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log("Connected to MongoDB Atlas"))
  .catch((err) => console.error("MongoDB connection error:", err))

// Routes
app.use("/api/users", userRoutes)
app.use("/api/imagery", imageryRoutes)
// app.use('/api/segment', segmentRoutes);
app.use("/api/segment", segmentRoutes)
app.use("/api/height", heightRoutes)
app.use("/api/predict", predictRoutes)
app.use("/api/alerts", alertsRoutes)
app.use("/api/deforestation", deforestationRoutes)
app.use("/api/mapdata", mapdataRoutes)
app.use("/api/reports", reportsRoutes)

// Health check route
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    message: "Server is running",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || "development",
    version: "1.0.0",
  })
})

// API documentation route
app.get("/api", (req, res) => {
  res.status(200).json({
    name: "Environmental Monitoring & Real Estate Forecasting API",
    version: "1.0.0",
    description: "Backend API for satellite imagery analysis and real estate prediction platform",
    endpoints: {
      users: "/api/users",
      imagery: "/api/imagery",
      height: "/api/height",
      predict: "/api/predict",
      alerts: "/api/alerts",
      deforestation: "/api/deforestation",
      mapdata: "/api/mapdata",
      reports: "/api/reports",
    },
    documentation: "Import the Postman collection for complete API documentation",
  })
})

// File upload error handling
app.use(handleUploadError)

// 404 handler
app.use(notFoundHandler)

// Global error handling
app.use(errorHandler)

// Start server
app.listen(PORT, () => {
  console.log(`🌍 Environmental Monitoring API Server`)
  console.log(`🚀 Server running on port ${PORT}`)
  console.log(`📊 Environment: ${process.env.NODE_ENV || "development"}`)
  console.log(`🔗 Health check: http://localhost:${PORT}/health`)
  console.log(`📚 API docs: http://localhost:${PORT}/api`)
  console.log(`⚡ Ready to process satellite imagery and predictions!`)
})

export default app
