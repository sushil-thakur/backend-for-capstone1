import express from "express"
import {
  predictPropertyValue,
  assessEnvironmentalRisk,
  getMarketTrends,
  analyzeInvestment,
  getPredictionResults,
} from "../controller/predictController.js"
import { validate } from "../middleware/validation.js"
import { body, param } from "express-validator"

const router = express.Router()

// Validation rules
const predictionValidation = {
  property: [
    body("coordinates.lat").isFloat({ min: -90, max: 90 }).withMessage("Invalid latitude"),
    body("coordinates.lng").isFloat({ min: -180, max: 180 }).withMessage("Invalid longitude"),
    body("propertyDetails.type")
      .isIn(["residential", "commercial", "industrial", "land"])
      .withMessage("Invalid property type"),
    body("propertyDetails.size").optional().isFloat({ min: 0 }).withMessage("Invalid property size"),
    body("predictionType")
      .optional()
      .isIn(["basic", "comprehensive", "detailed"])
      .withMessage("Invalid prediction type"),
    body("timeHorizon").optional().isIn(["1year", "3years", "5years", "10years"]).withMessage("Invalid time horizon"),
    body("userId").optional().isMongoId().withMessage("Invalid user ID"),
  ],
  risk: [
    body("coordinates.lat").isFloat({ min: -90, max: 90 }).withMessage("Invalid latitude"),
    body("coordinates.lng").isFloat({ min: -180, max: 180 }).withMessage("Invalid longitude"),
    body("riskRadius")
      .optional()
      .isInt({ min: 100, max: 50000 })
      .withMessage("Risk radius must be between 100-50000 meters"),
    body("riskTypes").optional().isIn(["environmental", "natural", "human", "all"]).withMessage("Invalid risk types"),
  ],
  investment: [
    body("properties").isArray({ min: 1, max: 50 }).withMessage("Properties array required (1-50 items)"),
    body("properties.*.coordinates.lat").isFloat({ min: -90, max: 90 }).withMessage("Invalid latitude"),
    body("properties.*.coordinates.lng").isFloat({ min: -180, max: 180 }).withMessage("Invalid longitude"),
    body("riskTolerance").optional().isIn(["low", "medium", "high"]).withMessage("Invalid risk tolerance"),
    body("timeHorizon")
      .optional()
      .isIn(["1year", "3years", "5years", "10years", "15years"])
      .withMessage("Invalid time horizon"),
    body("userId").optional().isMongoId().withMessage("Invalid user ID"),
  ],
}

// Predict property value
router.post("/property", predictionValidation.property, validate, predictPropertyValue)

// Assess environmental risk
router.post("/risk", predictionValidation.risk, validate, assessEnvironmentalRisk)

// Get market trends
router.get("/trends", getMarketTrends)

// Analyze investment
router.post("/investment", predictionValidation.investment, validate, analyzeInvestment)

// Get prediction results
router.get(
  "/results/:processingId",
  param("processingId").notEmpty().withMessage("Processing ID is required"),
  validate,
  getPredictionResults,
)

export default router
