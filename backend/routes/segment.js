import express from "express"
import {
  processGeographicArea,
  getAreaGeoJSON,
  getDetectionLayer,
  getSegmentationResults,
  getSegmentationById,
} from "../controller/segmentController.js"
import { validate } from "../middleware/validation.js"
import { body, param, query } from "express-validator"

const router = express.Router()

// Validation rules
const segmentValidation = {
  processArea: [
    body("bounds")
      .isArray({ min: 4, max: 4 })
      .withMessage("Bounds must be an array of 4 coordinates [minLat, minLng, maxLat, maxLng]"),
    body("bounds.*").isFloat({ min: -180, max: 180 }).withMessage("Invalid coordinate value"),
    body("userId").isMongoId().withMessage("Valid user ID is required"),
    body("zoneName").optional().isString().withMessage("Zone name must be a string"),
    body("detectionTypes")
      .optional()
      .isArray()
      .withMessage("Detection types must be an array")
      .custom((value) => {
        const validTypes = ["deforestation", "mining", "forest_fire", "agriculture", "urban_expansion", "water_body"]
        return value.every((type) => validTypes.includes(type))
      })
      .withMessage("Invalid detection type"),
    body("resolution").optional().isInt({ min: 1, max: 100 }).withMessage("Resolution must be between 1-100 meters"),
    body("alertThreshold").optional().isInt({ min: 0, max: 100 }).withMessage("Alert threshold must be 0-100"),
  ],
  getGeoJSON: [param("segmentationId").isMongoId().withMessage("Valid segmentation ID is required")],
  getLayer: [
    param("segmentationId").isMongoId().withMessage("Valid segmentation ID is required"),
    param("layerType")
      .isIn(["deforestation", "mining", "forest_fire", "agriculture", "urban_expansion", "water_body"])
      .withMessage("Invalid layer type"),
  ],
  getResults: [
    param("userId").isMongoId().withMessage("Valid user ID is required"),
    query("limit").optional().isInt({ min: 1, max: 100 }).withMessage("Limit must be between 1-100"),
    query("offset").optional().isInt({ min: 0 }).withMessage("Offset must be non-negative"),
  ],
}

// Process geographic area (replaces image upload)
router.post("/area", segmentValidation.processArea, validate, processGeographicArea)

// Get segmentation result as GeoJSON
router.get("/geojson/:segmentationId", segmentValidation.getGeoJSON, validate, getAreaGeoJSON)

// Get specific detection layer
router.get("/layer/:segmentationId/:layerType", segmentValidation.getLayer, validate, getDetectionLayer)

// Get user's segmentation results
router.get("/results/:userId", segmentValidation.getResults, validate, getSegmentationResults)

// Get specific segmentation result
router.get("/:segmentationId", param("segmentationId").isMongoId(), validate, getSegmentationById)

export default router
