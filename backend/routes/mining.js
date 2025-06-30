import express from "express"
import {
  detectMiningActivities,
  getMiningSites,
  analyzeMiningImpact,
  monitorMiningExpansion,
} from "../controller/miningController.js"
import { validate } from "../middleware/validation.js"
import { body } from "express-validator"

const router = express.Router()

// Validation rules
const miningValidation = {
  detect: [
    body("coordinates.bounds.minLat").isFloat({ min: -90, max: 90 }).withMessage("Invalid minimum latitude"),
    body("coordinates.bounds.maxLat").isFloat({ min: -90, max: 90 }).withMessage("Invalid maximum latitude"),
    body("coordinates.bounds.minLng").isFloat({ min: -180, max: 180 }).withMessage("Invalid minimum longitude"),
    body("coordinates.bounds.maxLng").isFloat({ min: -180, max: 180 }).withMessage("Invalid maximum longitude"),
    body("miningType")
      .optional()
      .isIn(["surface", "underground", "quarry", "strip", "all"])
      .withMessage("Invalid mining type"),
    body("sensitivity").optional().isIn(["low", "medium", "high"]).withMessage("Invalid sensitivity level"),
    body("userId").optional().isMongoId().withMessage("Invalid user ID"),
  ],
  impact: [
    body("coordinates.lat").isFloat({ min: -90, max: 90 }).withMessage("Invalid latitude"),
    body("coordinates.lng").isFloat({ min: -180, max: 180 }).withMessage("Invalid longitude"),
    body("impactRadius")
      .optional()
      .isInt({ min: 100, max: 50000 })
      .withMessage("Impact radius must be between 100-50000 meters"),
    body("assessmentType")
      .optional()
      .isIn(["basic", "comprehensive", "detailed"])
      .withMessage("Invalid assessment type"),
  ],
  monitor: [
    body("userId").isMongoId().withMessage("User ID is required"),
    body("zones").isArray({ min: 1 }).withMessage("At least one zone is required"),
    body("zones.*.name").notEmpty().withMessage("Zone name is required"),
    body("zones.*.coordinates").notEmpty().withMessage("Zone coordinates are required"),
  ],
}

// Detect mining activities
router.post("/detect", miningValidation.detect, validate, detectMiningActivities)

// Get known mining sites
router.get("/sites", getMiningSites)

// Analyze mining environmental impact
router.post("/impact", miningValidation.impact, validate, analyzeMiningImpact)

// Monitor mining expansion
router.post("/monitor", miningValidation.monitor, validate, monitorMiningExpansion)

export default router
