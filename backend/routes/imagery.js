import express from "express"
import { fetchSatelliteImagery, getSatelliteSources, compareImageryOverTime, getImageryResults } from "../controller/imageryController.js"
import { validate } from "../middleware/validation.js"
import { body, param } from "express-validator"

const router = express.Router()

// Validation rules
const imageryValidation = {
  fetch: [
    body("coordinates.bounds.minLat").isFloat({ min: -90, max: 90 }).withMessage("Invalid minimum latitude"),
    body("coordinates.bounds.maxLat").isFloat({ min: -90, max: 90 }).withMessage("Invalid maximum latitude"),
    body("coordinates.bounds.minLng").isFloat({ min: -180, max: 180 }).withMessage("Invalid minimum longitude"),
    body("coordinates.bounds.maxLng").isFloat({ min: -180, max: 180 }).withMessage("Invalid maximum longitude"),
    body("imageType")
      .optional()
      .isIn(["rgb", "nir", "swir", "thermal", "multispectral"])
      .withMessage("Invalid image type"),
    body("resolution").optional().isIn(["low", "medium", "high"]).withMessage("Invalid resolution"),
    body("cloudCover").optional().isInt({ min: 0, max: 100 }).withMessage("Cloud cover must be 0-100%"),
    body("userId").optional().isMongoId().withMessage("Invalid user ID"),
  ],
  compare: [
    body("coordinates").notEmpty().withMessage("Coordinates are required"),
    body("dates").isArray({ min: 2 }).withMessage("At least 2 dates are required"),
    body("analysisType")
      .optional()
      .isIn(["change_detection", "temporal_analysis", "trend_analysis"])
      .withMessage("Invalid analysis type"),
  ],
  results: [
    param("processingId").notEmpty().withMessage("Processing ID is required"),
  ],
}

// Fetch satellite imagery
router.post("/fetch", imageryValidation.fetch, validate, fetchSatelliteImagery)

// Get available satellite sources
router.get("/sources", getSatelliteSources)

// Compare imagery over time
router.post("/compare", imageryValidation.compare, validate, compareImageryOverTime)

// Get imagery processing results
router.get("/results/:processingId", imageryValidation.results, validate, getImageryResults)

export default router