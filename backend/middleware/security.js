import helmet from "helmet"
import mongoSanitize from "express-mongo-sanitize"
import rateLimit from "express-rate-limit"

export const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
})

export const mongoSanitization = mongoSanitize()

export const requestSizeLimit = rateLimit({
  windowMs: 1000, // 1 second
  max: 1000, // limit each IP to 1000 requests per second
  message: "Request size limit exceeded",
})

export const ipFilter = (req, res, next) => {
  const blockedIPs = process.env.BLOCKED_IPS ? process.env.BLOCKED_IPS.split(",") : []
  const clientIP = req.ip || req.connection.remoteAddress

  if (blockedIPs.includes(clientIP)) {
    return res.status(403).json({ error: "Access denied" })
  }

  next()
}

export const securityLogger = (req, res, next) => {
  if (process.env.NODE_ENV === "development") {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path} - IP: ${req.ip}`)
  }
  next()
}
