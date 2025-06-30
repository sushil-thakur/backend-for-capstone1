import express from "express"
import {
  detectForestFires,
  getFireRiskAssessment,
  getFireHistory,
  setupFireAlerts,
} from "../controller/fireController.js"
import { validate } from "../middleware/validation.js"
import { body } from "express-validator"

const router = express.Router()

// Validation rules
const fireValidation = {
  detect: [
    body("coordinates.bounds.minLat").isFloat({ min: -90, max: 90 }).withMessage("Invalid minimum latitude"),
    body("coordinates.bounds.maxLat").isFloat({ min: -90, max: 90 }).withMessage("Invalid maximum latitude"),
    body("coordinates.bounds.minLng").isFloat({ min: -180, max: 180 }).withMessage("Invalid minimum longitude"),
    body("coordinates.bounds.maxLng").isFloat({ min: -180, max: 180 }).withMessage("Invalid maximum longitude"),
    body("detectionType").optional().isIn(["active", "burned", "both"]).withMessage("Invalid detection type"),
    body("urgency").optional().isIn(["low", "medium", "high"]).withMessage("Invalid urgency level"),
    body("userId").optional().isMongoId().withMessage("Invalid user ID"),
  ],
  risk: [
    body("coordinates").notEmpty().withMessage("Coordinates are required"),
    body("season").optional().isIn(["spring", "summer", "fall", "winter", "current"]).withMessage("Invalid season"),
    body("riskFactors")
      .optional()
      .isIn(["weather", "vegetation", "topography", "all"])
      .withMessage("Invalid risk factors"),
  ],
  alerts: [
    body("userId").isMongoId().withMessage("User ID is required"),
    body("zones").isArray({ min: 1 }).withMessage("At least one zone is required"),
    body("zones.*.name").notEmpty().withMessage("Zone name is required"),
    body("zones.*.coordinates").notEmpty().withMessage("Zone coordinates are required"),
  ],
}

// Detect forest fires
router.post("/detect", fireValidation.detect, validate, detectForestFires)

// Get fire risk assessment
router.post("/risk", fireValidation.risk, validate, getFireRiskAssessment)

// Get fire history
router.get("/history", getFireHistory)

// Set up fire alerts
router.post("/alerts", fireValidation.alerts, validate, setupFireAlerts)

export default router
