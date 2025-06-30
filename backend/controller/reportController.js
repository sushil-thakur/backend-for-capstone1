import User from "../models/User.js"
import Alert from "../models/Alerts.js"
import PredictionResult from "../models/PredictionResult.js"
import SegmentationResult from "../models/SegmentationResult.js"
import PDFDocument from "pdfkit"
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { dirname } from "path"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Generate comprehensive user report
export const generateUserReport = async (req, res) => {
  try {
    const { userId } = req.params
    const { reportType = "comprehensive", startDate, endDate, format = "json" } = req.query

    // Get user data
    const user = await User.findById(userId)
    if (!user) {
      return res.status(404).json({ error: "User not found" })
    }

    // Set date range
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const end = endDate ? new Date(endDate) : new Date()

    // Get alerts data
    const alerts = await Alert.find({
      userId,
      createdAt: { $gte: start, $lte: end },
    }).sort({ createdAt: -1 })

    // Get predictions data
    const predictions = await PredictionResult.find({
      userId,
      createdAt: { $gte: start, $lte: end },
    }).sort({ createdAt: -1 })

    // Get segmentation results
    const segmentations = await SegmentationResult.find({
      userId,
      createdAt: { $gte: start, $lte: end },
    }).sort({ createdAt: -1 })

    // Generate report data
    const reportData = {
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        zonesCount: user.zonesOfInterest.length,
      },
      period: {
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        days: Math.ceil((end - start) / (1000 * 60 * 60 * 24)),
      },
      summary: {
        totalAlerts: alerts.length,
        criticalAlerts: alerts.filter((a) => a.severity === "critical").length,
        unreadAlerts: alerts.filter((a) => !a.read).length,
        totalPredictions: predictions.length,
        totalSegmentations: segmentations.length,
        averageConfidence:
          predictions.length > 0
            ? predictions.reduce((sum, p) => sum + (p.prediction.confidence || 0), 0) / predictions.length
            : 0,
      },
      alerts: {
        byType: getAlertsByType(alerts),
        bySeverity: getAlertsBySeverity(alerts),
        timeline: getAlertsTimeline(alerts),
        recent: alerts.slice(0, 10),
      },
      predictions: {
        summary: getPredictionsSummary(predictions),
        priceRanges: getPriceRanges(predictions),
        growthPotential: getGrowthPotentialStats(predictions),
        recent: predictions.slice(0, 10),
      },
      segmentations: {
        summary: getSegmentationsSummary(segmentations),
        detectionStats: getDetectionStats(segmentations),
        recent: segmentations.slice(0, 5),
      },
      zones: user.zonesOfInterest.map((zone) => ({
        id: zone._id,
        name: zone.name,
        description: zone.description,
        monitoringSettings: zone.monitoringSettings,
        alertsCount: alerts.filter((a) => a.zoneId === zone._id.toString()).length,
      })),
    }

    if (format === "pdf") {
      return generatePDFReport(reportData, res)
    }

    res.status(200).json({
      report: reportData,
      generatedAt: new Date().toISOString(),
    })
  } catch (error) {
    console.error("Error generating user report:", error)
    res.status(500).json({ error: "Failed to generate user report" })
  }
}

// Generate zone-specific report
export const generateZoneReport = async (req, res) => {
  try {
    const { userId, zoneId } = req.params
    const { startDate, endDate, format = "json" } = req.query

    const user = await User.findById(userId)
    if (!user) {
      return res.status(404).json({ error: "User not found" })
    }

    const zone = user.zonesOfInterest.find((z) => z._id.toString() === zoneId)
    if (!zone) {
      return res.status(404).json({ error: "Zone not found" })
    }

    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const end = endDate ? new Date(endDate) : new Date()

    // Get zone-specific data
    const alerts = await Alert.find({
      userId,
      zoneId: zoneId,
      createdAt: { $gte: start, $lte: end },
    }).sort({ createdAt: -1 })

    const segmentations = await SegmentationResult.find({
      userId,
      zoneName: zone.name,
      createdAt: { $gte: start, $lte: end },
    }).sort({ createdAt: -1 })

    const reportData = {
      zone: {
        id: zone._id,
        name: zone.name,
        description: zone.description,
        geometry: zone.geometry,
        monitoringSettings: zone.monitoringSettings,
        createdAt: zone.createdAt,
      },
      period: {
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        days: Math.ceil((end - start) / (1000 * 60 * 60 * 24)),
      },
      summary: {
        totalAlerts: alerts.length,
        criticalAlerts: alerts.filter((a) => a.severity === "critical").length,
        totalSegmentations: segmentations.length,
        riskLevel: calculateZoneRiskLevel(alerts),
      },
      alerts: {
        byType: getAlertsByType(alerts),
        bySeverity: getAlertsBySeverity(alerts),
        timeline: getAlertsTimeline(alerts),
        all: alerts,
      },
      segmentations: {
        summary: getSegmentationsSummary(segmentations),
        detectionStats: getDetectionStats(segmentations),
        all: segmentations,
      },
      recommendations: generateZoneRecommendations(zone, alerts, segmentations),
    }

    if (format === "pdf") {
      return generatePDFReport(reportData, res, `Zone_${zone.name}_Report`)
    }

    res.status(200).json({
      report: reportData,
      generatedAt: new Date().toISOString(),
    })
  } catch (error) {
    console.error("Error generating zone report:", error)
    res.status(500).json({ error: "Failed to generate zone report" })
  }
}

// Generate system analytics report
export const generateAnalyticsReport = async (req, res) => {
  try {
    const { startDate, endDate } = req.query

    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const end = endDate ? new Date(endDate) : new Date()

    // Get system-wide statistics
    const totalUsers = await User.countDocuments()
    const activeUsers = await User.countDocuments({
      updatedAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
    })

    const totalAlerts = await Alert.countDocuments({
      createdAt: { $gte: start, $lte: end },
    })

    const totalPredictions = await PredictionResult.countDocuments({
      createdAt: { $gte: start, $lte: end },
    })

    const totalSegmentations = await SegmentationResult.countDocuments({
      createdAt: { $gte: start, $lte: end },
    })

    // Get aggregated data
    const alertsByType = await Alert.aggregate([
      { $match: { createdAt: { $gte: start, $lte: end } } },
      { $group: { _id: "$alertType", count: { $sum: 1 } } },
    ])

    const alertsBySeverity = await Alert.aggregate([
      { $match: { createdAt: { $gte: start, $lte: end } } },
      { $group: { _id: "$severity", count: { $sum: 1 } } },
    ])

    const reportData = {
      period: {
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        days: Math.ceil((end - start) / (1000 * 60 * 60 * 24)),
      },
      systemStats: {
        totalUsers,
        activeUsers,
        totalAlerts,
        totalPredictions,
        totalSegmentations,
        userGrowthRate: calculateGrowthRate("users", start, end),
      },
      alerts: {
        byType: alertsByType.reduce((acc, item) => {
          acc[item._id] = item.count
          return acc
        }, {}),
        bySeverity: alertsBySeverity.reduce((acc, item) => {
          acc[item._id] = item.count
          return acc
        }, {}),
      },
      performance: {
        averageResponseTime: "250ms", // This would come from monitoring
        uptime: "99.9%",
        errorRate: "0.1%",
      },
    }

    res.status(200).json({
      report: reportData,
      generatedAt: new Date().toISOString(),
    })
  } catch (error) {
    console.error("Error generating analytics report:", error)
    res.status(500).json({ error: "Failed to generate analytics report" })
  }
}

// Helper functions
const getAlertsByType = (alerts) => {
  return alerts.reduce((acc, alert) => {
    acc[alert.alertType] = (acc[alert.alertType] || 0) + 1
    return acc
  }, {})
}

const getAlertsBySeverity = (alerts) => {
  return alerts.reduce((acc, alert) => {
    acc[alert.severity] = (acc[alert.severity] || 0) + 1
    return acc
  }, {})
}

const getAlertsTimeline = (alerts) => {
  const timeline = {}
  alerts.forEach((alert) => {
    const date = alert.createdAt.toISOString().split("T")[0]
    timeline[date] = (timeline[date] || 0) + 1
  })
  return timeline
}

const getPredictionsSummary = (predictions) => {
  if (predictions.length === 0) return {}

  const prices = predictions.map((p) => p.prediction.estimatedPrice).filter((p) => p)
  const confidences = predictions.map((p) => p.prediction.confidence).filter((c) => c)

  return {
    averagePrice: prices.reduce((sum, price) => sum + price, 0) / prices.length,
    minPrice: Math.min(...prices),
    maxPrice: Math.max(...prices),
    averageConfidence: confidences.reduce((sum, conf) => sum + conf, 0) / confidences.length,
  }
}

const getPriceRanges = (predictions) => {
  const ranges = { low: 0, medium: 0, high: 0 }
  predictions.forEach((p) => {
    const price = p.prediction.estimatedPrice
    if (price < 100000) ranges.low++
    else if (price < 500000) ranges.medium++
    else ranges.high++
  })
  return ranges
}

const getGrowthPotentialStats = (predictions) => {
  return predictions.reduce((acc, p) => {
    const potential = p.prediction.growthPotential
    acc[potential] = (acc[potential] || 0) + 1
    return acc
  }, {})
}

const getSegmentationsSummary = (segmentations) => {
  return {
    totalImages: segmentations.length,
    modelUsage: segmentations.reduce((acc, s) => {
      acc[s.modelUsed] = (acc[s.modelUsed] || 0) + 1
      return acc
    }, {}),
    averageProcessingTime:
      segmentations.reduce((sum, s) => sum + (s.metadata?.processingTime || 0), 0) / segmentations.length,
  }
}

const getDetectionStats = (segmentations) => {
  const stats = {}
  segmentations.forEach((s) => {
    s.detections.forEach((d) => {
      stats[d.class] = (stats[d.class] || 0) + 1
    })
  })
  return stats
}

const calculateZoneRiskLevel = (alerts) => {
  const criticalCount = alerts.filter((a) => a.severity === "critical").length
  const highCount = alerts.filter((a) => a.severity === "high").length

  if (criticalCount > 5) return "Critical"
  if (criticalCount > 2 || highCount > 10) return "High"
  if (highCount > 5) return "Medium"
  return "Low"
}

const generateZoneRecommendations = (zone, alerts, segmentations) => {
  const recommendations = []

  const criticalAlerts = alerts.filter((a) => a.severity === "critical").length
  const deforestationAlerts = alerts.filter((a) => a.alertType === "deforestation").length
  const miningAlerts = alerts.filter((a) => a.alertType === "mining").length

  if (criticalAlerts > 3) {
    recommendations.push({
      type: "urgent",
      message: "Immediate attention required due to multiple critical alerts",
      action: "Review zone boundaries and increase monitoring frequency",
    })
  }

  if (deforestationAlerts > 5) {
    recommendations.push({
      type: "environmental",
      message: "High deforestation activity detected",
      action: "Consider implementing conservation measures",
    })
  }

  if (miningAlerts > 3) {
    recommendations.push({
      type: "regulatory",
      message: "Mining activity detected",
      action: "Verify mining permits and environmental compliance",
    })
  }

  return recommendations
}

const calculateGrowthRate = async (type, start, end) => {
  // Simplified growth rate calculation
  return Math.random() * 10 // Placeholder
}

const generatePDFReport = (reportData, res, filename = "Report") => {
  try {
    const doc = new PDFDocument()
    const pdfPath = path.join(__dirname, "../uploads", `${filename}_${Date.now()}.pdf`)

    doc.pipe(fs.createWriteStream(pdfPath))
    doc.pipe(res)

    // Set response headers
    res.setHeader("Content-Type", "application/pdf")
    res.setHeader("Content-Disposition", `attachment; filename="${filename}.pdf"`)

    // Generate PDF content
    doc.fontSize(20).text("Environmental Monitoring Report", 100, 100)
    doc.fontSize(12).text(`Generated: ${new Date().toISOString()}`, 100, 130)

    if (reportData.user) {
      doc.text(`User: ${reportData.user.username}`, 100, 160)
      doc.text(`Email: ${reportData.user.email}`, 100, 180)
    }

    if (reportData.summary) {
      doc.text("Summary:", 100, 220)
      doc.text(`Total Alerts: ${reportData.summary.totalAlerts}`, 120, 240)
      doc.text(`Critical Alerts: ${reportData.summary.criticalAlerts}`, 120, 260)
      doc.text(`Total Predictions: ${reportData.summary.totalPredictions}`, 120, 280)
    }

    doc.end()
  } catch (error) {
    console.error("Error generating PDF:", error)
    res.status(500).json({ error: "Failed to generate PDF report" })
  }
}
