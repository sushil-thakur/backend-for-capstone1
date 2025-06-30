import mongoose from "mongoose"

const predictionResultSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    location: {
      latitude: {
        type: Number,
        required: true,
        min: -90,
        max: 90,
      },
      longitude: {
        type: Number,
        required: true,
        min: -180,
        max: 180,
      },
      address: {
        type: String,
        trim: true,
      },
    },
    inputFeatures: {
      buildingHeight: Number,
      vegetationIndex: Number,
      distanceToMining: Number,
      distanceToDeforestation: Number,
      distanceToFireRisk: Number,
      environmentalRiskScore: Number,
      additionalFeatures: {
        type: mongoose.Schema.Types.Mixed,
        default: {},
      },
    },
    prediction: {
      estimatedPrice: {
        type: Number,
        required: true,
        min: 0,
      },
      confidence: {
        type: Number,
        required: true,
        min: 0,
        max: 100,
      },
      growthPotential: {
        type: String,
        enum: ["Low", "Medium", "High"],
        required: true,
      },
      priceRange: {
        min: Number,
        max: Number,
      },
      riskFactors: {
        environmental: Number,
        economic: Number,
        social: Number,
        overall: Number,
      },
    },
    modelInfo: {
      modelVersion: {
        type: String,
        default: "XGBoost_v2.0_Enhanced",
      },
      processingTime: {
        type: Number, // in milliseconds
        default: 0,
      },
      factors: {
        type: mongoose.Schema.Types.Mixed,
        default: {},
      },
      accuracy: {
        type: Number,
        min: 0,
        max: 100,
        default: 85,
      },
    },
    marketAnalysis: {
      comparableProperties: Number,
      marketTrend: {
        type: String,
        enum: ["declining", "stable", "growing", "booming"],
        default: "stable",
      },
      investmentRecommendation: {
        type: String,
        enum: ["avoid", "caution", "consider", "recommended"],
        default: "consider",
      },
    },
  },
  {
    timestamps: true,
  },
)

// Indexes
predictionResultSchema.index({ userId: 1, createdAt: -1 })
predictionResultSchema.index({ "location.latitude": 1, "location.longitude": 1 })
predictionResultSchema.index({ "prediction.estimatedPrice": 1 })
predictionResultSchema.index({ "prediction.growthPotential": 1 })
predictionResultSchema.index({ "marketAnalysis.investmentRecommendation": 1 })

export default mongoose.model("PredictionResult", predictionResultSchema)
