import express from "express"
import {
  analyzeDeforestation,
  getDeforestationHotspots,
  getDeforestationTrends,
  setupDeforestationAlerts,
  getDeforestationResults,
} from "../controller/deforestationController.js"
import { validate } from "../middleware/validation.js"
import { body, query, param } from "express-validator"

const router = express.Router()

// Validation rules
const deforestationValidation = {
  analyze: [
    body("coordinates.bounds.minLat").isFloat({ min: -90, max: 90 }).withMessage("Invalid minimum latitude"),
    body("coordinates.bounds.maxLat").isFloat({ min: -90, max: 90 }).withMessage("Invalid maximum latitude"),
    body("coordinates.bounds.minLng").isFloat({ min: -180, max: 180 }).withMessage("Invalid minimum longitude"),
    body("coordinates.bounds.maxLng").isFloat({ min: -180, max: 180 }).withMessage("Invalid maximum longitude"),
    body("timeRange").optional().isIn(["3months", "6months", "1year", "2years"]).withMessage("Invalid time range"),
    body("userId").optional().isMongoId().withMessage("Invalid user ID"),
  ],
  hotspots: [
    query("timeframe")
      .optional()
      .isIn(["7days", "30days", "3months", "6months", "1year"])
      .withMessage("Invalid timeframe"),
    query("severity").optional().isIn(["low", "medium", "high", "all"]).withMessage("Invalid severity level"),
  ],
  alerts: [
    body("userId").isMongoId().withMessage("User ID is required"),
    body("zones").isArray({ min: 1 }).withMessage("At least one zone is required"),
    body("zones.*.name").notEmpty().withMessage("Zone name is required"),
    body("zones.*.coordinates").notEmpty().withMessage("Zone coordinates are required"),
  ],
}

// Analyze area for deforestation
router.post("/analyze", deforestationValidation.analyze, validate, analyzeDeforestation)

// Get deforestation hotspots
router.get("/hotspots", deforestationValidation.hotspots, validate, getDeforestationHotspots)

// Get deforestation trends
router.get("/trends", getDeforestationTrends)

// Set up deforestation alerts
router.post("/alerts", deforestationValidation.alerts, validate, setupDeforestationAlerts)

// Get analysis results
router.get(
  "/results/:processingId",
  param("processingId").notEmpty().withMessage("Processing ID is required"),
  validate,
  getDeforestationResults,
)

export default router
