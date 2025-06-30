import mongoose from "mongoose"

const alertSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  zoneId: {
    type: String,
    required: true,
  },
  alertType: {
    type: String,
    required: true,
    enum: ["deforestation", "mining", "forest_fire", "agriculture", "urban_expansion", "water_body", "infrastructure", "system"],
  },
  severity: {
    type: String,
    required: true,
    enum: ["low", "medium", "high", "critical"],
    default: "medium",
  },
  title: {
    type: String,
    required: true,
    maxlength: 200,
  },
  message: {
    type: String,
    required: true,
    maxlength: 1000,
  },
  coordinates: {
    latitude: {
      type: Number,
      min: -90,
      max: 90,
    },
    longitude: {
      type: Number,
      min: -180,
      max: 180,
    },
  },
  affectedArea: {
    type: Number,
    min: 0,
  },
  confidence: {
    type: Number,
    min: 0,
    max: 100,
  },
  status: {
    type: String,
    enum: ["active", "acknowledged", "resolved", "dismissed"],
    default: "active",
  },
  priority: {
    type: Number,
    min: 1,
    max: 10,
    default: 5,
  },
  metadata: {
    detectionClass: String,
    boundingBox: [Number],
    segmentationResultId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SegmentationResult",
    },
    additionalInfo: mongoose.Schema.Types.Mixed,
    weatherConditions: {
      temperature: Number,
      humidity: Number,
      windSpeed: Number,
      cloudCover: Number,
    },
    environmentalContext: {
      nearbyWaterBodies: Boolean,
      proximityToUrbanAreas: Number,
      vegetationDensity: Number,
      elevation: Number,
    },
  },
  notifications: {
    email: {
      sent: {
        type: Boolean,
        default: false,
      },
      sentAt: Date,
    },
    telegram: {
      sent: {
        type: Boolean,
        default: false,
      },
      sentAt: Date,
    },
    push: {
      sent: {
        type: Boolean,
        default: false,
      },
      sentAt: Date,
    },
  },
  actions: [
    {
      actionType: {
        type: String,
        enum: ["investigate", "monitor", "alert_authorities", "schedule_inspection", "update_status"],
      },
      description: String,
      performedBy: String,
      performedAt: {
        type: Date,
        default: Date.now,
      },
      result: String,
    },
  ],
  relatedAlerts: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Alert",
    },
  ],
  isActive: {
    type: Boolean,
    default: true,
  },
  acknowledgedAt: Date,
  acknowledgedBy: String,
  resolvedAt: Date,
  resolvedBy: String,
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
alertSchema.index({ userId: 1, createdAt: -1 })
alertSchema.index({ zoneId: 1 })
alertSchema.index({ alertType: 1 })
alertSchema.index({ severity: 1 })
alertSchema.index({ status: 1 })
alertSchema.index({ isActive: 1 })
alertSchema.index({ "coordinates.latitude": 1, "coordinates.longitude": 1 })

// Compound indexes
alertSchema.index({ userId: 1, alertType: 1, status: 1 })
alertSchema.index({ severity: 1, createdAt: -1 })

// Update the updatedAt field before saving
alertSchema.pre("save", function (next) {
  this.updatedAt = new Date()
  next()
})

// Virtual for calculating alert age
alertSchema.virtual("ageInHours").get(function () {
  return Math.floor((new Date() - this.createdAt) / (1000 * 60 * 60))
})

// Virtual for determining if alert is urgent
alertSchema.virtual("isUrgent").get(function () {
  return this.severity === "critical" || (this.severity === "high" && this.ageInHours > 24)
})

export default mongoose.model("Alert", alertSchema)
