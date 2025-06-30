import mongoose from "mongoose"

const detectionSchema = new mongoose.Schema({
  class: {
    type: String,
    required: true,
    enum: ["deforestation", "mining", "forest_fire", "agriculture", "urban_expansion", "water_body", "infrastructure"],
  },
  confidence: {
    type: Number,
    required: true,
    min: 0,
    max: 100,
  },
  bbox: {
    type: [Number],
    required: true,
    validate: {
      validator: function (v) {
        return v.length === 4
      },
      message: "Bounding box must have 4 coordinates [x, y, width, height]",
    },
  },
  center: {
    type: [Number],
    validate: {
      validator: function (v) {
        return v.length === 2 && v[1] >= -90 && v[1] <= 90 && v[0] >= -180 && v[0] <= 180
      },
      message: "Center must be [longitude, latitude] with valid coordinates",
    },
  },
  area: {
    type: Number,
    min: 0,
  },
  severity: {
    type: String,
    enum: ["low", "medium", "high", "critical"],
    default: "medium",
  },
  // Mining-specific fields
  mining_type: {
    type: String,
    enum: ["surface", "underground", "quarry", "unknown"],
  },
  infrastructure_detected: {
    type: Boolean,
    default: false,
  },
  aspect_ratio: Number,
  edge_density: Number,
  // Fire-specific fields
  fire_type: {
    type: String,
    enum: ["active", "burned", "smoke", "unknown"],
  },
  active_fire_ratio: Number,
  smoke_ratio: Number,
  burned_ratio: Number,
  heat_signature: Number,
  // Deforestation-specific fields
  vegetation_loss: Number,
  shape_regularity: Number,
  deforestation_rate: Number,
  // Additional metadata
  additionalInfo: {
    type: mongoose.Schema.Types.Mixed,
  },
})

const segmentationResultSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  processingId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  zoneName: {
    type: String,
    required: true,
    maxlength: 200,
  },
  originalImagePath: {
    type: String,
    // No longer required for geographic processing
  },
  resultImagePath: {
    type: String,
    // No longer required for geographic processing
  },
  modelUsed: {
    type: String,
    required: true,
    default: "Satellite_Geographic_Analysis_v3.0",
  },
  inputType: {
    type: String,
    enum: ["image_upload", "geographic_bounds", "building_coordinates", "coordinate_analysis"],
    default: "geographic_bounds",
  },
  coordinates: {
    bounds: {
      minLat: Number,
      maxLat: Number,
      minLng: Number,
      maxLng: Number,
    },
    center: {
      lat: Number,
      lng: Number,
    },
    buildings: [{
      lat: Number,
      lng: Number,
      id: String,
    }],
  },
  summary: {
    totalBuildings: Number,
    averageHeight: Number,
    maxHeight: Number,
    minHeight: Number,
    heightDistribution: mongoose.Schema.Types.Mixed,
    confidenceScore: Number,
    heightStdDev: Number,
    averageConfidence: Number,
  },
  detections: [detectionSchema],
  confidence: {
    type: Number,
    required: true,
    min: 0,
    max: 100,
  },
  analysisType: {
    type: String,
    enum: ["image_upload", "geographic_area", "coordinate_analysis", "time_series"],
    default: "geographic_area",
  },
  environmentalRisk: {
    type: String,
    enum: ["Low", "Medium", "High", "Critical"],
    default: "Low",
  },
  metadata: {
    processingTime: Number,
    areaSize: Number, // in km²
    bounds: [Number], // [minLat, minLng, maxLat, maxLng]
    resolution: Number, // meters per pixel
    detectionTypes: [String],
    detectionCount: Number,
    satelliteSource: {
      type: String,
      default: "Sentinel-2",
    },
    processingDate: {
      type: Date,
      default: Date.now,
    },
    weatherConditions: {
      cloudCover: Number,
      temperature: Number,
      humidity: Number,
    },
    qualityMetrics: {
      imageQuality: Number,
      processingAccuracy: Number,
      dataCompleteness: Number,
    },
    // Height estimation specific fields
    analysisType: String,
    processingStarted: Date,
    processingCompleted: Date,
    heightParameters: mongoose.Schema.Types.Mixed,
    statistics: mongoose.Schema.Types.Mixed,
    heightMap: mongoose.Schema.Types.Mixed,
    error: String,
    // Batch processing fields
    batchId: String,
    chunkIndex: Number,
    totalBuildings: Number,
    priority: String,
  },
  status: {
    type: String,
    enum: ["processing", "completed", "failed", "queued"],
    default: "completed",
  },
  processingLogs: [
    {
      timestamp: {
        type: Date,
        default: Date.now,
      },
      level: {
        type: String,
        enum: ["info", "warning", "error"],
        default: "info",
      },
      message: String,
    },
  ],
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
})

// Indexes for better performance
segmentationResultSchema.index({ userId: 1, createdAt: -1 })
segmentationResultSchema.index({ processingId: 1 })
segmentationResultSchema.index({ zoneName: 1 })
segmentationResultSchema.index({ analysisType: 1 })
segmentationResultSchema.index({ environmentalRisk: 1 })
segmentationResultSchema.index({ "metadata.bounds": 1 })
segmentationResultSchema.index({ "detections.class": 1 })
segmentationResultSchema.index({ "detections.severity": 1 })

// Update the updatedAt field before saving
segmentationResultSchema.pre("save", function (next) {
  this.updatedAt = new Date()
  next()
})

// Virtual for getting detection summary
segmentationResultSchema.virtual("detectionSummary").get(function () {
  const summary = {}
  this.detections.forEach((detection) => {
    if (!summary[detection.class]) {
      summary[detection.class] = {
        count: 0,
        averageConfidence: 0,
        totalArea: 0,
        severityDistribution: { low: 0, medium: 0, high: 0, critical: 0 },
      }
    }
    summary[detection.class].count++
    summary[detection.class].totalArea += detection.area || 0
    summary[detection.class].severityDistribution[detection.severity]++
  })

  // Calculate average confidence for each class
  Object.keys(summary).forEach((className) => {
    const classDetections = this.detections.filter((d) => d.class === className)
    const totalConfidence = classDetections.reduce((sum, d) => sum + d.confidence, 0)
    summary[className].averageConfidence = totalConfidence / classDetections.length
  })

  return summary
})

export default mongoose.model("SegmentationResult", segmentationResultSchema)
