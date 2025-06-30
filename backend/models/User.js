import mongoose from "mongoose"

const zoneOfInterestSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    maxlength: 100,
  },
  description: {
    type: String,
    maxlength: 500,
  },
  geometry: {
    type: {
      type: String,
      enum: ["Polygon"],
      required: true,
    },
    coordinates: {
      type: [[[Number]]],
      required: true,
    },
  },
  monitoringSettings: {
    alertThreshold: {
      type: Number,
      default: 70,
      min: 0,
      max: 100,
    },
    detectionTypes: {
      type: [String],
      enum: ["deforestation", "mining", "forest_fire", "agriculture", "urban_expansion", "water_body"],
      default: ["deforestation", "mining", "forest_fire"],
    },
    monitoringFrequency: {
      type: String,
      enum: ["daily", "weekly", "monthly"],
      default: "weekly",
    },
    enableAlerts: {
      type: Boolean,
      default: true,
    },
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
})

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    minlength: 3,
    maxlength: 30,
    trim: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, "Please enter a valid email"],
  },
  telegramChatId: {
    type: String,
    sparse: true,
  },
  zonesOfInterest: [zoneOfInterestSchema],
  preferences: {
    language: {
      type: String,
      default: "en",
      enum: ["en", "es", "fr", "de", "pt"],
    },
    timezone: {
      type: String,
      default: "UTC",
    },
    notifications: {
      email: {
        type: Boolean,
        default: true,
      },
      telegram: {
        type: Boolean,
        default: false,
      },
      push: {
        type: Boolean,
        default: true,
      },
    },
    mapSettings: {
      defaultZoom: {
        type: Number,
        default: 10,
        min: 1,
        max: 20,
      },
      defaultCenter: {
        latitude: {
          type: Number,
          default: 0,
          min: -90,
          max: 90,
        },
        longitude: {
          type: Number,
          default: 0,
          min: -180,
          max: 180,
        },
      },
      enabledLayers: {
        type: [String],
        default: ["deforestation", "mining", "forest_fire"],
      },
    },
  },
  subscription: {
    plan: {
      type: String,
      enum: ["free", "basic", "premium", "enterprise"],
      default: "free",
    },
    startDate: {
      type: Date,
      default: Date.now,
    },
    endDate: Date,
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  usage: {
    segmentationsThisMonth: {
      type: Number,
      default: 0,
    },
    lastSegmentationDate: Date,
    totalSegmentations: {
      type: Number,
      default: 0,
    },
    apiCallsThisMonth: {
      type: Number,
      default: 0,
    },
  },
  isActive: {
    type: Boolean,
    default: true,
  },
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
userSchema.index({ email: 1 })
userSchema.index({ username: 1 })
userSchema.index({ telegramChatId: 1 })
userSchema.index({ "zonesOfInterest.geometry": "2dsphere" })

// Update the updatedAt field before saving
userSchema.pre("save", function (next) {
  this.updatedAt = new Date()
  next()
})

export default mongoose.model("User", userSchema)
