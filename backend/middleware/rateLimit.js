import rateLimit from "express-rate-limit"

export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    error: "Too many requests",
    message: "Please try again later",
  },
  standardHeaders: true,
  legacyHeaders: false,
})

export const segmentLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // limit each IP to 10 segmentation requests per hour
  message: {
    error: "Segmentation rate limit exceeded",
    message: "Maximum 10 segmentation requests per hour",
  },
})

export const mapLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 50, // limit each IP to 50 map requests per 5 minutes
  message: {
    error: "Map API rate limit exceeded",
    message: "Maximum 50 map requests per 5 minutes",
  },
})
