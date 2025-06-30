import express from "express"
import { generateUserReport, generateZoneReport, generateAnalyticsReport } from "../controller/reportController.js"
import { validate } from "../middleware/validation.js"
import { param, query } from "express-validator"

const router = express.Router()

// Validation rules for reports
const reportValidation = {
  userReport: [
    param("userId").isMongoId().withMessage("User ID must be a valid MongoDB ID"),
    query("reportType")
      .optional()
      .isIn(["comprehensive", "alerts", "predictions", "segmentations"])
      .withMessage("Invalid report type"),
    query("startDate").optional().isISO8601().withMessage("Start date must be a valid ISO date"),
    query("endDate").optional().isISO8601().withMessage("End date must be a valid ISO date"),
    query("format").optional().isIn(["json", "pdf"]).withMessage("Format must be json or pdf"),
  ],
  zoneReport: [
    param("userId").isMongoId().withMessage("User ID must be a valid MongoDB ID"),
    param("zoneId").isMongoId().withMessage("Zone ID must be a valid MongoDB ID"),
    query("startDate").optional().isISO8601().withMessage("Start date must be a valid ISO date"),
    query("endDate").optional().isISO8601().withMessage("End date must be a valid ISO date"),
    query("format").optional().isIn(["json", "pdf"]).withMessage("Format must be json or pdf"),
  ],
  analytics: [
    query("startDate").optional().isISO8601().withMessage("Start date must be a valid ISO date"),
    query("endDate").optional().isISO8601().withMessage("End date must be a valid ISO date"),
  ],
}

// Generate comprehensive user report
router.get("/user/:userId", reportValidation.userReport, validate, generateUserReport)

// Generate zone-specific report
router.get("/user/:userId/zone/:zoneId", reportValidation.zoneReport, validate, generateZoneReport)

// Generate system analytics report
router.get("/analytics", reportValidation.analytics, validate, generateAnalyticsReport)

export default router
