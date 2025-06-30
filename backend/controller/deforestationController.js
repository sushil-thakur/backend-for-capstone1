import SegmentationResult from "../models/SegmentationResult.js"
import Alert from "../models/Alerts.js"
import User from "../models/User.js"
import { spawn } from "child_process"
import path from "path"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Analyze area for deforestation
export const analyzeDeforestation = async (req, res) => {
  try {
    const { coordinates, userId, zoneName, timeRange = "1year" } = req.body

    if (!coordinates || !coordinates.bounds) {
      return res.status(400).json({ error: "Geographic bounds are required" })
    }

    const { minLat, minLng, maxLat, maxLng } = coordinates.bounds

    // Validate coordinates
    if (minLat >= maxLat || minLng >= maxLng) {
      return res.status(400).json({ error: "Invalid coordinate bounds" })
    }

    // Calculate area size (rough estimation)
    const areaSize = (maxLat - minLat) * (maxLng - minLng) * 111 * 111 // km²
    if (areaSize > 10000) {
      return res.status(400).json({ error: "Area too large. Maximum 10,000 km²" })
    }

    // Create processing record
    const processingId = `deforestation_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    const segmentationResult = new SegmentationResult({
      userId: userId || "anonymous",
      processingId,
      modelUsed: "deforestation_detection_v2",
      inputType: "geographic_bounds",
      coordinates: {
        bounds: { minLat, minLng, maxLat, maxLng },
        center: {
          lat: (minLat + maxLat) / 2,
          lng: (minLng + maxLng) / 2,
        },
      },
      zoneName: zoneName || `Deforestation Analysis ${new Date().toISOString().split("T")[0]}`,
      status: "processing",
      metadata: {
        analysisType: "deforestation",
        timeRange,
        areaSize: areaSize.toFixed(2),
        processingStarted: new Date(),
        detectionParameters: {
          forestLossThreshold: 0.3,
          minimumPatchSize: 0.5, // hectares
          temporalWindow: timeRange,
          vegetationIndex: "NDVI",
        },
      },
    })

    await segmentationResult.save()

    // Process deforestation analysis
    const pythonScript = path.join(__dirname, "../scripts/deforestation_analysis.py")
    const pythonProcess = spawn("python", [
      pythonScript,
      JSON.stringify({
        bounds: { minLat, minLng, maxLat, maxLng },
        processingId,
        timeRange,
        outputDir: path.join(__dirname, "../uploads/results"),
        analysisType: "deforestation",
      }),
    ])

    let pythonOutput = ""
    let pythonError = ""

    pythonProcess.stdout.on("data", (data) => {
      pythonOutput += data.toString()
    })

    pythonProcess.stderr.on("data", (data) => {
      pythonError += data.toString()
    })

    pythonProcess.on("close", async (code) => {
      try {
        if (code === 0 && pythonOutput) {
          const results = JSON.parse(pythonOutput)

          // Update segmentation result with analysis
          segmentationResult.status = "completed"
          segmentationResult.detections = results.detections || []
          segmentationResult.summary = {
            totalForestLoss: results.summary?.totalForestLoss || 0,
            forestLossPercentage: results.summary?.forestLossPercentage || 0,
            affectedAreas: results.summary?.affectedAreas || 0,
            severityLevel: results.summary?.severityLevel || "low",
            confidenceScore: results.summary?.confidenceScore || 0,
          }
          segmentationResult.metadata.processingCompleted = new Date()
          segmentationResult.metadata.processingTime = Date.now() - segmentationResult.createdAt.getTime()

          await segmentationResult.save()

          // Create alerts for significant deforestation
          if (results.summary?.forestLossPercentage > 5) {
            await createDeforestationAlert(userId, segmentationResult, results.summary)
          }

          res.status(200).json({
            success: true,
            processingId,
            results: {
              summary: results.summary,
              detections: results.detections,
              analysisComplete: true,
              forestLossHotspots: results.hotspots || [],
              temporalAnalysis: results.temporalAnalysis || {},
              riskAssessment: results.riskAssessment || {},
            },
          })
        } else {
          segmentationResult.status = "failed"
          segmentationResult.metadata.error = pythonError || "Processing failed"
          await segmentationResult.save()

          res.status(500).json({
            error: "Deforestation analysis failed",
            details: pythonError,
            processingId,
          })
        }
      } catch (error) {
        console.error("Error processing deforestation results:", error)
        res.status(500).json({ error: "Failed to process analysis results" })
      }
    })

    // Return immediate response
    res.status(202).json({
      message: "Deforestation analysis started",
      processingId,
      estimatedTime: "2-5 minutes",
      status: "processing",
    })
  } catch (error) {
    console.error("Error in deforestation analysis:", error)
    res.status(500).json({ error: "Failed to start deforestation analysis" })
  }
}

// Get deforestation hotspots
export const getDeforestationHotspots = async (req, res) => {
  try {
    const { region, timeframe = "30days", severity = "all" } = req.query

    const query = {
      "metadata.analysisType": "deforestation",
      status: "completed",
      createdAt: {
        $gte: new Date(Date.now() - getTimeframeMs(timeframe)),
      },
    }

    if (severity !== "all") {
      query["summary.severityLevel"] = severity
    }

    const hotspots = await SegmentationResult.find(query)
      .sort({ "summary.forestLossPercentage": -1 })
      .limit(50)
      .select("coordinates summary zoneName createdAt metadata")

    const processedHotspots = hotspots.map((spot) => ({
      id: spot._id,
      location: spot.coordinates,
      zoneName: spot.zoneName,
      forestLoss: spot.summary?.forestLossPercentage || 0,
      affectedArea: spot.summary?.totalForestLoss || 0,
      severity: spot.summary?.severityLevel || "unknown",
      confidence: spot.summary?.confidenceScore || 0,
      detectedAt: spot.createdAt,
      riskLevel: calculateRiskLevel(spot.summary),
    }))

    res.status(200).json({
      hotspots: processedHotspots,
      summary: {
        totalHotspots: processedHotspots.length,
        highRisk: processedHotspots.filter((h) => h.riskLevel === "high").length,
        mediumRisk: processedHotspots.filter((h) => h.riskLevel === "medium").length,
        lowRisk: processedHotspots.filter((h) => h.riskLevel === "low").length,
      },
    })
  } catch (error) {
    console.error("Error getting deforestation hotspots:", error)
    res.status(500).json({ error: "Failed to get deforestation hotspots" })
  }
}

// Get deforestation trends
export const getDeforestationTrends = async (req, res) => {
  try {
    const { region, timeframe = "1year" } = req.query

    const startDate = new Date(Date.now() - getTimeframeMs(timeframe))

    const trends = await SegmentationResult.aggregate([
      {
        $match: {
          "metadata.analysisType": "deforestation",
          status: "completed",
          createdAt: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
          },
          totalForestLoss: { $sum: "$summary.totalForestLoss" },
          averageConfidence: { $avg: "$summary.confidenceScore" },
          detectionCount: { $sum: 1 },
          maxLossPercentage: { $max: "$summary.forestLossPercentage" },
        },
      },
      {
        $sort: { "_id.year": 1, "_id.month": 1 },
      },
    ])

    const monthlyData = trends.map((trend) => ({
      period: `${trend._id.year}-${String(trend._id.month).padStart(2, "0")}`,
      forestLoss: trend.totalForestLoss,
      detections: trend.detectionCount,
      averageConfidence: trend.averageConfidence,
      maxLossPercentage: trend.maxLossPercentage,
    }))

    // Calculate trend analysis
    const trendAnalysis = calculateTrendAnalysis(monthlyData)

    res.status(200).json({
      trends: monthlyData,
      analysis: trendAnalysis,
      summary: {
        totalPeriods: monthlyData.length,
        totalForestLoss: monthlyData.reduce((sum, data) => sum + data.forestLoss, 0),
        totalDetections: monthlyData.reduce((sum, data) => sum + data.detections, 0),
        averageMonthlyLoss: monthlyData.reduce((sum, data) => sum + data.forestLoss, 0) / monthlyData.length,
      },
    })
  } catch (error) {
    console.error("Error getting deforestation trends:", error)
    res.status(500).json({ error: "Failed to get deforestation trends" })
  }
}

// Set up deforestation monitoring alerts
export const setupDeforestationAlerts = async (req, res) => {
  try {
    const { userId, zones, alertSettings } = req.body

    if (!userId || !zones || !Array.isArray(zones)) {
      return res.status(400).json({ error: "User ID and zones array are required" })
    }

    const user = await User.findById(userId)
    if (!user) {
      return res.status(404).json({ error: "User not found" })
    }

    // Update user's monitoring zones
    for (const zone of zones) {
      const existingZoneIndex = user.zonesOfInterest.findIndex((z) => z.name === zone.name)

      const zoneConfig = {
        name: zone.name,
        description: zone.description || `Deforestation monitoring for ${zone.name}`,
        geometry: zone.coordinates,
        monitoringSettings: {
          deforestation: {
            enabled: true,
            threshold: alertSettings?.threshold || 5, // percentage
            checkInterval: alertSettings?.checkInterval || "daily",
            alertSeverity: alertSettings?.alertSeverity || "medium",
            notificationMethods: alertSettings?.notificationMethods || ["email"],
          },
        },
        createdAt: new Date(),
        isActive: true,
      }

      if (existingZoneIndex >= 0) {
        user.zonesOfInterest[existingZoneIndex] = zoneConfig
      } else {
        user.zonesOfInterest.push(zoneConfig)
      }
    }

    await user.save()

    res.status(200).json({
      message: "Deforestation monitoring alerts configured successfully",
      monitoredZones: zones.length,
      alertSettings: alertSettings,
    })
  } catch (error) {
    console.error("Error setting up deforestation alerts:", error)
    res.status(500).json({ error: "Failed to setup deforestation alerts" })
  }
}

// Get deforestation analysis results
export const getDeforestationResults = async (req, res) => {
  try {
    const { processingId } = req.params

    const result = await SegmentationResult.findOne({ processingId })
    if (!result) {
      return res.status(404).json({ error: "Analysis result not found" })
    }

    res.status(200).json({
      processingId,
      status: result.status,
      summary: result.summary,
      detections: result.detections,
      metadata: result.metadata,
      createdAt: result.createdAt,
    })
  } catch (error) {
    console.error("Error getting deforestation results:", error)
    res.status(500).json({ error: "Failed to get analysis results" })
  }
}

// Helper functions
const createDeforestationAlert = async (userId, segmentationResult, summary) => {
  try {
    const alert = new Alert({
      userId: userId || "system",
      zoneId: segmentationResult._id.toString(),
      alertType: "deforestation",
      severity: summary.severityLevel === "high" ? "critical" : "high",
      title: `Significant Deforestation Detected`,
      message: `Forest loss of ${summary.forestLossPercentage.toFixed(2)}% detected in ${segmentationResult.zoneName}. Affected area: ${summary.totalForestLoss.toFixed(2)} hectares.`,
      coordinates: segmentationResult.coordinates.center,
      affectedArea: summary.totalForestLoss,
      confidence: summary.confidenceScore,
      metadata: {
        detectionClass: "forest_loss",
        segmentationResultId: segmentationResult._id,
        analysisType: "deforestation",
        forestLossPercentage: summary.forestLossPercentage,
        severityLevel: summary.severityLevel,
      },
    })

    await alert.save()
    return alert
  } catch (error) {
    console.error("Error creating deforestation alert:", error)
  }
}

const getTimeframeMs = (timeframe) => {
  const timeframes = {
    "7days": 7 * 24 * 60 * 60 * 1000,
    "30days": 30 * 24 * 60 * 60 * 1000,
    "3months": 90 * 24 * 60 * 60 * 1000,
    "6months": 180 * 24 * 60 * 60 * 1000,
    "1year": 365 * 24 * 60 * 60 * 1000,
  }
  return timeframes[timeframe] || timeframes["30days"]
}

const calculateRiskLevel = (summary) => {
  if (!summary) return "unknown"

  const lossPercentage = summary.forestLossPercentage || 0
  const confidence = summary.confidenceScore || 0

  if (lossPercentage > 10 && confidence > 0.8) return "high"
  if (lossPercentage > 5 && confidence > 0.6) return "medium"
  return "low"
}

const calculateTrendAnalysis = (monthlyData) => {
  if (monthlyData.length < 2) return { trend: "insufficient_data" }

  const recent = monthlyData.slice(-3)
  const previous = monthlyData.slice(-6, -3)

  const recentAvg = recent.reduce((sum, data) => sum + data.forestLoss, 0) / recent.length
  const previousAvg = previous.reduce((sum, data) => sum + data.forestLoss, 0) / previous.length

  const changePercentage = previousAvg > 0 ? ((recentAvg - previousAvg) / previousAvg) * 100 : 0

  return {
    trend: changePercentage > 10 ? "increasing" : changePercentage < -10 ? "decreasing" : "stable",
    changePercentage: changePercentage.toFixed(2),
    recentAverage: recentAvg.toFixed(2),
    previousAverage: previousAvg.toFixed(2),
  }
}
