import SegmentationResult from "../models/SegmentationResult.js"
import Alert from "../models/Alert.js"
import User from "../models/User.js"
import { spawn } from "child_process"
import path from "path"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Detect active fires and burned areas
export const detectForestFires = async (req, res) => {
  try {
    const { coordinates, userId, zoneName, detectionType = "both", urgency = "high" } = req.body

    if (!coordinates || !coordinates.bounds) {
      return res.status(400).json({ error: "Geographic bounds are required" })
    }

    const { minLat, minLng, maxLat, maxLng } = coordinates.bounds

    // Validate coordinates
    if (minLat >= maxLat || minLng >= maxLng) {
      return res.status(400).json({ error: "Invalid coordinate bounds" })
    }

    const areaSize = (maxLat - minLat) * (maxLng - minLng) * 111 * 111 // km²
    if (areaSize > 50000) {
      return res.status(400).json({ error: "Area too large. Maximum 50,000 km²" })
    }

    const processingId = `fire_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    const segmentationResult = new SegmentationResult({
      userId: userId || "anonymous",
      processingId,
      modelUsed: "fire_detection_v4",
      inputType: "geographic_bounds",
      coordinates: {
        bounds: { minLat, minLng, maxLat, maxLng },
        center: {
          lat: (minLat + maxLat) / 2,
          lng: (minLng + maxLng) / 2,
        },
      },
      zoneName: zoneName || `Fire Detection ${new Date().toISOString().split("T")[0]}`,
      status: "processing",
      metadata: {
        analysisType: "fire_detection",
        detectionType, // "active", "burned", "both"
        urgency,
        areaSize: areaSize.toFixed(2),
        processingStarted: new Date(),
        detectionParameters: {
          thermalThreshold: 320, // Kelvin
          smokeDetection: true,
          burnedAreaMapping: detectionType === "burned" || detectionType === "both",
          activeFires: detectionType === "active" || detectionType === "both",
          spectralIndices: ["NBR", "NDVI", "SWIR"],
          confidenceThreshold: urgency === "high" ? 0.6 : 0.8,
        },
      },
    })

    await segmentationResult.save()

    // Process fire detection
    const pythonScript = path.join(__dirname, "../scripts/fire_detection.py")
    const pythonProcess = spawn("python", [
      pythonScript,
      JSON.stringify({
        bounds: { minLat, minLng, maxLat, maxLng },
        processingId,
        detectionType,
        urgency,
        outputDir: path.join(__dirname, "../uploads/results"),
        analysisType: "fire_detection",
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

          segmentationResult.status = "completed"
          segmentationResult.detections = results.detections || []
          segmentationResult.summary = {
            activeFires: results.summary?.activeFires || 0,
            burnedArea: results.summary?.burnedArea || 0,
            fireIntensity: results.summary?.fireIntensity || "low",
            riskLevel: results.summary?.riskLevel || "low",
            confidenceScore: results.summary?.confidenceScore || 0,
            weatherConditions: results.summary?.weatherConditions || {},
          }
          segmentationResult.metadata.processingCompleted = new Date()
          segmentationResult.metadata.processingTime = Date.now() - segmentationResult.createdAt.getTime()

          await segmentationResult.save()

          // Create urgent alerts for active fires
          if (results.summary?.activeFires > 0 || results.summary?.riskLevel === "high") {
            await createFireAlert(userId, segmentationResult, results.summary)
          }

          res.status(200).json({
            success: true,
            processingId,
            results: {
              summary: results.summary,
              detections: results.detections,
              analysisComplete: true,
              fireHotspots: results.fireHotspots || [],
              burnedAreas: results.burnedAreas || [],
              riskAssessment: results.riskAssessment || {},
              evacuationZones: results.evacuationZones || [],
            },
          })
        } else {
          segmentationResult.status = "failed"
          segmentationResult.metadata.error = pythonError || "Fire detection failed"
          await segmentationResult.save()

          res.status(500).json({
            error: "Fire detection failed",
            details: pythonError,
            processingId,
          })
        }
      } catch (error) {
        console.error("Error processing fire detection results:", error)
        res.status(500).json({ error: "Failed to process fire detection results" })
      }
    })

    // Return immediate response
    res.status(202).json({
      message: "Fire detection started",
      processingId,
      estimatedTime: "1-3 minutes",
      status: "processing",
      urgency,
    })
  } catch (error) {
    console.error("Error in fire detection:", error)
    res.status(500).json({ error: "Failed to start fire detection" })
  }
}

// Get fire risk assessment
export const getFireRiskAssessment = async (req, res) => {
  try {
    const { coordinates, season = "current", riskFactors = "all" } = req.body

    if (!coordinates) {
      return res.status(400).json({ error: "Coordinates are required" })
    }

    const processingId = `fire_risk_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    // Process fire risk assessment
    const pythonScript = path.join(__dirname, "../scripts/fire_risk_assessment.py")
    const pythonProcess = spawn("python", [
      pythonScript,
      JSON.stringify({
        coordinates,
        season,
        riskFactors,
        processingId,
        outputDir: path.join(__dirname, "../uploads/results"),
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

          res.status(200).json({
            success: true,
            processingId,
            riskAssessment: {
              overallRisk: results.overallRisk || "unknown",
              riskScore: results.riskScore || 0,
              riskFactors: results.riskFactors || {},
              weatherConditions: results.weatherConditions || {},
              vegetationMoisture: results.vegetationMoisture || 0,
              topographicRisk: results.topographicRisk || "low",
              historicalFireData: results.historicalFireData || {},
              recommendations: results.recommendations || [],
              monitoringAdvice: results.monitoringAdvice || [],
            },
          })
        } else {
          res.status(500).json({
            error: "Fire risk assessment failed",
            details: pythonError,
            processingId,
          })
        }
      } catch (error) {
        console.error("Error processing fire risk assessment:", error)
        res.status(500).json({ error: "Failed to process fire risk assessment" })
      }
    })
  } catch (error) {
    console.error("Error in fire risk assessment:", error)
    res.status(500).json({ error: "Failed to start fire risk assessment" })
  }
}

// Get fire history data
export const getFireHistory = async (req, res) => {
  try {
    const { bounds, timeframe = "5years", includeStatistics = true } = req.query

    if (!bounds) {
      return res.status(400).json({ error: "Bounds parameter is required" })
    }

    const boundsObj = JSON.parse(bounds)
    const startDate = new Date(Date.now() - getTimeframeMs(timeframe))

    const fireHistory = await SegmentationResult.find({
      "metadata.analysisType": "fire_detection",
      status: "completed",
      createdAt: { $gte: startDate },
      "coordinates.bounds.minLat": { $lte: boundsObj.maxLat },
      "coordinates.bounds.maxLat": { $gte: boundsObj.minLat },
      "coordinates.bounds.minLng": { $lte: boundsObj.maxLng },
      "coordinates.bounds.maxLng": { $gte: boundsObj.minLng },
    }).sort({ createdAt: -1 })

    const processedHistory = fireHistory.map((fire) => ({
      id: fire._id,
      date: fire.createdAt,
      location: fire.coordinates,
      activeFires: fire.summary?.activeFires || 0,
      burnedArea: fire.summary?.burnedArea || 0,
      intensity: fire.summary?.fireIntensity || "unknown",
      riskLevel: fire.summary?.riskLevel || "unknown",
      confidence: fire.summary?.confidenceScore || 0,
    }))

    let statistics = {}
    if (includeStatistics) {
      statistics = {
        totalIncidents: processedHistory.length,
        totalBurnedArea: processedHistory.reduce((sum, fire) => sum + fire.burnedArea, 0),
        averageIntensity: calculateAverageIntensity(processedHistory),
        seasonalPattern: calculateSeasonalPattern(processedHistory),
        riskTrends: calculateRiskTrends(processedHistory),
      }
    }

    res.status(200).json({
      fireHistory: processedHistory,
      statistics,
      timeframe,
      area: boundsObj,
    })
  } catch (error) {
    console.error("Error getting fire history:", error)
    res.status(500).json({ error: "Failed to get fire history" })
  }
}

// Set up fire alerts
export const setupFireAlerts = async (req, res) => {
  try {
    const { userId, zones, alertSettings } = req.body

    if (!userId || !zones || !Array.isArray(zones)) {
      return res.status(400).json({ error: "User ID and zones array are required" })
    }

    const user = await User.findById(userId)
    if (!user) {
      return res.status(404).json({ error: "User not found" })
    }

    // Update user's monitoring zones for fire alerts
    for (const zone of zones) {
      const existingZoneIndex = user.zonesOfInterest.findIndex((z) => z.name === zone.name)

      const zoneConfig = {
        name: zone.name,
        description: zone.description || `Fire monitoring for ${zone.name}`,
        geometry: zone.coordinates,
        monitoringSettings: {
          fire: {
            enabled: true,
            riskThreshold: alertSettings?.riskThreshold || "medium",
            checkInterval: alertSettings?.checkInterval || "hourly",
            alertSeverity: alertSettings?.alertSeverity || "high",
            notificationMethods: alertSettings?.notificationMethods || ["email", "sms"],
            monitoringTypes: alertSettings?.monitoringTypes || ["active", "burned"],
            weatherAlerts: alertSettings?.weatherAlerts || true,
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
      message: "Fire monitoring alerts configured successfully",
      monitoredZones: zones.length,
      alertSettings: alertSettings,
    })
  } catch (error) {
    console.error("Error setting up fire alerts:", error)
    res.status(500).json({ error: "Failed to setup fire alerts" })
  }
}

// Helper functions
const createFireAlert = async (userId, segmentationResult, summary) => {
  try {
    const severity = summary.activeFires > 0 ? "critical" : summary.riskLevel === "high" ? "high" : "medium"

    const alert = new Alert({
      userId: userId || "system",
      zoneId: segmentationResult._id.toString(),
      alertType: "forest_fire",
      severity,
      title: summary.activeFires > 0 ? "Active Fire Detected" : "High Fire Risk Area",
      message:
        summary.activeFires > 0
          ? `${summary.activeFires} active fire(s) detected in ${segmentationResult.zoneName}. Burned area: ${summary.burnedArea.toFixed(2)} hectares.`
          : `High fire risk detected in ${segmentationResult.zoneName}. Risk level: ${summary.riskLevel}.`,
      coordinates: segmentationResult.coordinates.center,
      affectedArea: summary.burnedArea,
      confidence: summary.confidenceScore,
      priority: summary.activeFires > 0 ? 10 : 7,
      metadata: {
        detectionClass: "fire_detection",
        segmentationResultId: segmentationResult._id,
        analysisType: "fire_detection",
        activeFires: summary.activeFires,
        burnedArea: summary.burnedArea,
        fireIntensity: summary.fireIntensity,
        riskLevel: summary.riskLevel,
        weatherConditions: summary.weatherConditions,
      },
    })

    await alert.save()
    return alert
  } catch (error) {
    console.error("Error creating fire alert:", error)
  }
}

const getTimeframeMs = (timeframe) => {
  const timeframes = {
    "30days": 30 * 24 * 60 * 60 * 1000,
    "3months": 90 * 24 * 60 * 60 * 1000,
    "1year": 365 * 24 * 60 * 60 * 1000,
    "5years": 5 * 365 * 24 * 60 * 60 * 1000,
    "10years": 10 * 365 * 24 * 60 * 60 * 1000,
  }
  return timeframes[timeframe] || timeframes["1year"]
}

const calculateAverageIntensity = (fireHistory) => {
  const intensityMap = { low: 1, medium: 2, high: 3, extreme: 4 }
  const total = fireHistory.reduce((sum, fire) => sum + (intensityMap[fire.intensity] || 0), 0)
  return fireHistory.length > 0 ? total / fireHistory.length : 0
}

const calculateSeasonalPattern = (fireHistory) => {
  const seasons = { spring: 0, summer: 0, fall: 0, winter: 0 }
  fireHistory.forEach((fire) => {
    const month = new Date(fire.date).getMonth()
    if (month >= 2 && month <= 4) seasons.spring++
    else if (month >= 5 && month <= 7) seasons.summer++
    else if (month >= 8 && month <= 10) seasons.fall++
    else seasons.winter++
  })
  return seasons
}

const calculateRiskTrends = (fireHistory) => {
  const riskMap = { low: 1, medium: 2, high: 3, critical: 4 }
  const recent = fireHistory.slice(0, Math.floor(fireHistory.length / 2))
  const older = fireHistory.slice(Math.floor(fireHistory.length / 2))

  const recentAvg = recent.reduce((sum, fire) => sum + (riskMap[fire.riskLevel] || 0), 0) / recent.length
  const olderAvg = older.reduce((sum, fire) => sum + (riskMap[fire.riskLevel] || 0), 0) / older.length

  return {
    trend: recentAvg > olderAvg ? "increasing" : recentAvg < olderAvg ? "decreasing" : "stable",
    recentAverage: recentAvg.toFixed(2),
    olderAverage: olderAvg.toFixed(2),
  }
}
