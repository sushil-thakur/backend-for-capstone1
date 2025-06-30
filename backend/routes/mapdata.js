import express from "express"
import { getMapLayers, analyzeCoordinates, getTimeSeries } from "../controller/mapController.js"
import { validate } from "../middleware/validation.js"
import { body, query } from "express-validator"

const router = express.Router()

// Validation rules
const mapValidation = {
  getLayers: [
    query("detectionTypes")
      .optional()
      .custom((value) => {
        const types = value.split(",")
        const validTypes = ["deforestation", "mining", "forest_fire", "agriculture", "urban_expansion", "water_body"]
        return types.every((type) => validTypes.includes(type))
      })
      .withMessage("Invalid detection types"),
    query("bounds")
      .optional()
      .custom((value) => {
        const coords = value.split(",").map(Number)
        return coords.length === 4 && coords.every((coord) => !isNaN(coord))
      })
      .withMessage("Bounds must be 4 comma-separated numbers"),
    query("userId").optional().isMongoId().withMessage("Invalid user ID"),
  ],
  analyzeCoordinates: [
    body("latitude").isFloat({ min: -90, max: 90 }).withMessage("Valid latitude is required"),
    body("longitude").isFloat({ min: -180, max: 180 }).withMessage("Valid longitude is required"),
    body("radius").optional().isInt({ min: 100, max: 50000 }).withMessage("Radius must be between 100-50000 meters"),
    body("detectionTypes")
      .optional()
      .isArray()
      .withMessage("Detection types must be an array")
      .custom((value) => {
        const validTypes = ["deforestation", "mining", "forest_fire", "agriculture", "urban_expansion", "water_body"]
        return value.every((type) => validTypes.includes(type))
      })
      .withMessage("Invalid detection type"),
  ],
  getTimeSeries: [
    query("bounds")
      .notEmpty()
      .custom((value) => {
        const coords = value.split(",").map(Number)
        return coords.length === 4 && coords.every((coord) => !isNaN(coord))
      })
      .withMessage("Valid bounds are required (4 comma-separated numbers)"),
    query("timeInterval")
      .optional()
      .isIn(["day", "week", "month", "year"])
      .withMessage("Time interval must be day, week, month, or year"),
    query("startDate").optional().isISO8601().withMessage("Start date must be valid ISO date"),
    query("endDate").optional().isISO8601().withMessage("End date must be valid ISO date"),
  ],
}

// Get all detection layers for map visualization
router.get("/layers", mapValidation.getLayers, validate, getMapLayers)

// Analyze specific coordinates
router.post("/analyze", mapValidation.analyzeCoordinates, validate, analyzeCoordinates)

// Get time series environmental data
router.get("/timeseries", mapValidation.getTimeSeries, validate, getTimeSeries)

export default router
