import { body, param, validationResult } from "express-validator"
import DOMPurify from "isomorphic-dompurify"

export const userValidation = {
  create: [
    body("username").isString().isLength({ min: 3, max: 30 }).withMessage("Username must be 3-30 characters"),
    body("email").isEmail().withMessage("Valid email is required"),
    body("telegramChatId").optional().isString().withMessage("Telegram chat ID must be a string"),
  ],
  getById: [param("userId").isMongoId().withMessage("User ID must be a valid MongoDB ID")],
  update: [
    param("userId").isMongoId().withMessage("User ID must be a valid MongoDB ID"),
    body("username").optional().isString().isLength({ min: 3, max: 30 }).withMessage("Username must be 3-30 characters"),
    body("email").optional().isEmail().withMessage("Valid email is required"),
    body("telegramChatId").optional().isString().withMessage("Telegram chat ID must be a string"),
  ],
  delete: [param("userId").isMongoId().withMessage("User ID must be a valid MongoDB ID")],
  addZone: [
    param("userId").isMongoId().withMessage("User ID must be a valid MongoDB ID"),
    body("name").isString().isLength({ min: 1, max: 100 }).withMessage("Zone name is required (1-100 characters)"),
    body("description").optional().isString().withMessage("Description must be a string"),
    body("coordinates").isArray().withMessage("Coordinates must be an array"),
    body("coordinates.*").isArray({ min: 2, max: 2 }).withMessage("Each coordinate must be [lng, lat]"),
    body("monitoringSettings").optional().isObject().withMessage("Monitoring settings must be an object"),
  ],
  updateZone: [
    param("userId").isMongoId().withMessage("User ID must be a valid MongoDB ID"),
    param("zoneId").isMongoId().withMessage("Zone ID must be a valid MongoDB ID"),
    body("name").optional().isString().isLength({ min: 1, max: 100 }).withMessage("Zone name must be 1-100 characters"),
    body("description").optional().isString().withMessage("Description must be a string"),
    body("coordinates").optional().isArray().withMessage("Coordinates must be an array"),
    body("monitoringSettings").optional().isObject().withMessage("Monitoring settings must be an object"),
  ],
  deleteZone: [
    param("userId").isMongoId().withMessage("User ID must be a valid MongoDB ID"),
    param("zoneId").isMongoId().withMessage("Zone ID must be a valid MongoDB ID"),
  ],
}

export const validate = (req, res, next) => {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: "Validation failed",
      details: errors.array(),
    })
  }
  next()
}

export const sanitizeInput = (req, res, next) => {
  const sanitizeObject = (obj) => {
    if (typeof obj === "string") {
      return DOMPurify.sanitize(obj)
    }
    if (Array.isArray(obj)) {
      return obj.map(sanitizeObject)
    }
    if (obj && typeof obj === "object") {
      const sanitized = {}
      for (const [key, value] of Object.entries(obj)) {
        sanitized[key] = sanitizeObject(value)
      }
      return sanitized
    }
    return obj
  }

  if (req.body) {
    req.body = sanitizeObject(req.body)
  }
  if (req.query) {
    req.query = sanitizeObject(req.query)
  }
  if (req.params) {
    req.params = sanitizeObject(req.params)
  }

  next()
}
