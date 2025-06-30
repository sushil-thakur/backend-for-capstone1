import express from "express"
import {
  estimateBuildingHeights,
  batchHeightEstimation,
  getHeightResults,
  getHeightStatistics,
} from "../controller/heightController.js"
import { validate } from "../middleware/validation.js"
import { body, query, param } from "express-validator"

const router = express.Router()

// Validation rules
const heightValidation = {
  estimate: [
    body("coordinates").notEmpty().withMessage("Coordinates are required"),
    body("resolution").optional().isIn(["low", "medium", "high"]).withMessage("Invalid resolution"),
    body("analysisType").optional().isIn(["buildings", "structures", "all"]).withMessage("Invalid analysis type"),
    body("userId").optional().isMongoId().withMessage("Invalid user ID"),
  ],
  batch: [
    body("buildings").isArray({ min: 1, max: 1000 }).withMessage("Buildings array required (1-1000 items)"),
    body("buildings.*.lat").isFloat({ min: -90, max: 90 }).withMessage("Invalid latitude"),
    body("buildings.*.lng").isFloat({ min: -180, max: 180 }).withMessage("Invalid longitude"),
    body("priority").optional().isIn(["low", "normal", "high"]).withMessage("Invalid priority"),
    body("userId").optional().isMongoId().withMessage("Invalid user ID"),
  ],
  statistics: [
    query("bounds").notEmpty().withMessage("Bounds parameter is required"),
    query("timeframe")
      .optional()
      .isIn(["7days", "30days", "3months", "6months", "1year"])
      .withMessage("Invalid timeframe"),
  ],
}

// Estimate building heights
router.post("/estimate", heightValidation.estimate, validate, estimateBuildingHeights)

// Batch height estimation
router.post("/batch", heightValidation.batch, validate, batchHeightEstimation)

// Get height estimation results
router.get(
  "/results/:processingId",
  param("processingId").notEmpty().withMessage("Processing ID is required"),
  validate,
  getHeightResults,
)

// Get height statistics
router.get("/statistics", heightValidation.statistics, validate, getHeightStatistics)

export default router
