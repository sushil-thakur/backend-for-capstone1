import SegmentationResult from "../models/SegmentationResult.js"
import Alert from "../models/Alerts.js"
import User from "../models/User.js"
import { spawn } from "child_process"
import path from "path"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Detect mining activities
export const detectMiningActivities = async (req, res) => {
  try {
    const { coordinates, userId, zoneName, miningType = "all", sensitivity = "medium" } = req.body

    if (!coordinates || !coordinates.bounds) {
      return res.status(400).json({ error: "Geographic bounds are required" })
    }

    const { minLat, minLng, maxLat, maxLng } = coordinates.bounds

    // Validate coordinates
    if (minLat >= maxLat || minLng >= maxLng) {
      return res.status(400).json({ error: "Invalid coordinate bounds" })
    }

    const areaSize = (maxLat - minLat) * (maxLng - minLng) * 111 * 111 // km²
    if (areaSize > 5000) {
      return res.status(400).json({ error: "Area too large. Maximum 5,000 km²" })
    }

    const processingId = `mining_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    const segmentationResult = new SegmentationResult({
      userId: userId || "anonymous",
      processingId,
      modelUsed: "mining_detection_v3",
      inputType: "geographic_bounds",
      coordinates: {
        bounds: { minLat, minLng, maxLat, maxLng },
        center: {
          lat: (minLat + maxLat) / 2,
          lng: (minLng + maxLng) / 2,
        },
      },
      zoneName: zoneName || `Mining Detection ${new Date().toISOString().split("T")[0]}`,
      status: "processing",
      metadata: {
        analysisType: "mining_detection",
        miningType,
        sensitivity,
        areaSize: areaSize.toFixed(2),
        processingStarted: new Date(),
        detectionParameters: {
          miningTypes: miningType === "all" ? ["surface", "underground", "quarry", "strip"] : [miningType],
          spectralIndices: ["NDVI", "NDMI", "BSI"],
          changeDetection: true,
          minimumSiteSize: 1.0, // hectares
          confidenceThreshold: sensitivity === "high" ? 0.7 : sensitivity === "low" ? 0.5 : 0.6,
        },
      },
    })

    await segmentationResult.save()

    // Process mining detection
    const pythonScript = path.join(__dirname, "../scripts/mining_detection.py")
    const pythonProcess = spawn("python", [
      pythonScript,
      JSON.stringify({
        bounds: { minLat, minLng, maxLat, maxLng },
        processingId,
        miningType,
        sensitivity,
        outputDir: path.join(__dirname, "../uploads/results"),
        analysisType: "mining_detection",
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
            totalMiningSites: results.summary?.totalMiningSites || 0,
            totalAffectedArea: results.summary?.totalAffectedArea || 0,
            miningTypes: results.summary?.miningTypes || {},
            environmentalImpact: results.summary?.environmentalImpact || "low",
            confidenceScore: results.summary?.confidenceScore || 0,
          }
          segmentationResult.metadata.processingCompleted = new Date()
          segmentationResult.metadata.processingTime = Date.now() - segmentationResult.createdAt.getTime()

          await segmentationResult.save()

          // Create alerts for significant mining activities
          if (results.summary?.totalMiningSites > 0) {
            await createMiningAlert(userId, segmentationResult, results.summary)
          }

          res.status(200).json({
            success: true,
            processingId,
            results: {
              summary: results.summary,
              detections: results.detections,
              analysisComplete: true,
              miningSites: results.miningSites || [],
              environmentalAssessment: results.environmentalAssessment || {},
              complianceCheck: results.complianceCheck || {},
            },
          })
        } else {
          segmentationResult.status = "failed"
          segmentationResult.metadata.error = pythonError || "Mining detection failed"
          await segmentationResult.save()

          res.status(500).json({
            error: "Mining detection failed",
            details: pythonError,
            processingId,
          })
        }
      } catch (error) {
        console.error("Error processing mining detection results:", error)
        res.status(500).json({ error: "Failed to process mining detection results" })
      }
    })

    // Return immediate response
    res.status(202).json({
      message: "Mining detection started",
      processingId,
      estimatedTime: "3-7 minutes",
      status: "processing",
    })
  } catch (error) {
    console.error("Error in mining detection:", error)
    res.status(500).json({ error: "Failed to start mining detection" })
  }
}

// Get known mining sites
export const getMiningSites = async (req, res) => {
  try {
    const { region, miningType = "all", status = "all", limit = 100 } = req.query

    const query = {
      "metadata.analysisType": "mining_detection",
      status: "completed",
    }

    if (miningType !== "all") {
      query["summary.miningTypes"] = { $exists: true }
    }

    const miningSites = await SegmentationResult.find(query)
      .sort({ createdAt: -1 })
      .limit(Number.parseInt(limit))
      .select("coordinates summary zoneName createdAt metadata detections")

    const processedSites = miningSites.map((site) => ({
      id: site._id,
      location: site.coordinates,
      zoneName: site.zoneName,
      totalSites: site.summary?.totalMiningSites || 0,
      affectedArea: site.summary?.totalAffectedArea || 0,
      miningTypes: site.summary?.miningTypes || {},
      environmentalImpact: site.summary?.environmentalImpact || "unknown",
      confidence: site.summary?.confidenceScore || 0,
      detectedAt: site.createdAt,
      detections: site.detections || [],
    }))

    res.status(200).json({
      miningSites: processedSites,
      summary: {
        totalSites: processedSites.length,
        totalAffectedArea: processedSites.reduce((sum, site) => sum + site.affectedArea, 0),
        highImpact: processedSites.filter((s) => s.environmentalImpact === "high").length,
        mediumImpact: processedSites.filter((s) => s.environmentalImpact === "medium").length,
        lowImpact: processedSites.filter((s) => s.environmentalImpact === "low").length,
      },
    })
  } catch (error) {
    console.error("Error getting mining sites:", error)
    res.status(500).json({ error: "Failed to get mining sites" })
  }
}

// Analyze mining environmental impact
export const analyzeMiningImpact = async (req, res) => {
  try {
    const { coordinates, impactRadius = 5000, assessmentType = "comprehensive" } = req.body

    if (!coordinates || !coordinates.lat || !coordinates.lng) {
      return res.status(400).json({ error: "Mining site coordinates are required" })
    }

    const processingId = `mining_impact_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    // Create impact assessment bounds
    const radiusInDegrees = impactRadius / 111000
    const bounds = {
      minLat: coordinates.lat - radiusInDegrees,
      maxLat: coordinates.lat + radiusInDegrees,
      minLng: coordinates.lng - radiusInDegrees,
      maxLng: coordinates.lng + radiusInDegrees,
    }

    const segmentationResult = new SegmentationResult({
      userId: req.body.userId || "anonymous",
      processingId,
      modelUsed: "mining_impact_assessment_v1",
      inputType: "point_radius",
      coordinates: {
        center: coordinates,
        bounds,
        radius: impactRadius,
      },
      zoneName: `Mining Impact Assessment ${new Date().toISOString().split("T")[0]}`,
      status: "processing",
      metadata: {
        analysisType: "mining_impact",
        assessmentType,
        impactRadius,
        processingStarted: new Date(),
        assessmentParameters: {
          waterQuality: true,
          airQuality: true,
          soilContamination: true,
          vegetationHealth: true,
          wildlifeHabitat: true,
          noiseLevel: true,
        },
      },
    })

    await segmentationResult.save()

    // Process impact assessment
    const pythonScript = path.join(__dirname, "../scripts/mining_impact_assessment.py")
    const pythonProcess = spawn("python", [
      pythonScript,
      JSON.stringify({
        center: coordinates,
        bounds,
        impactRadius,
        assessmentType,
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

          segmentationResult.status = "completed"
          segmentationResult.summary = {
            overallImpactScore: results.summary?.overallImpactScore || 0,
            impactLevel: results.summary?.impactLevel || "unknown",
            affectedArea: results.summary?.affectedArea || 0,
            environmentalFactors: results.summary?.environmentalFactors || {},
            riskAssessment: results.summary?.riskAssessment || {},
          }
          segmentationResult.metadata.processingCompleted = new Date()
          segmentationResult.metadata.processingTime = Date.now() - segmentationResult.createdAt.getTime()

          await segmentationResult.save()

          res.status(200).json({
            success: true,
            processingId,
            results: {
              summary: results.summary,
              impactAssessment: results.impactAssessment,
              recommendations: results.recommendations,
              complianceStatus: results.complianceStatus,
              analysisComplete: true,
            },
          })
        } else {
          segmentationResult.status = "failed"
          segmentationResult.metadata.error = pythonError || "Impact assessment failed"
          await segmentationResult.save()

          res.status(500).json({
            error: "Mining impact assessment failed",
            details: pythonError,
            processingId,
          })
        }
      } catch (error) {
        console.error("Error processing mining impact results:", error)
        res.status(500).json({ error: "Failed to process impact assessment results" })
      }
    })

    // Return immediate response
    res.status(202).json({
      message: "Mining impact assessment started",
      processingId,
      estimatedTime: "5-10 minutes",
      status: "processing",
    })
  } catch (error) {
    console.error("Error in mining impact analysis:", error)
    res.status(500).json({ error: "Failed to start mining impact analysis" })
  }
}

// Monitor mining expansion
export const monitorMiningExpansion = async (req, res) => {
  try {
    const { userId, zones, monitoringSettings } = req.body

    if (!userId || !zones || !Array.isArray(zones)) {
      return res.status(400).json({ error: "User ID and zones array are required" })
    }

    const user = await User.findById(userId)
    if (!user) {
      return res.status(404).json({ error: "User not found" })
    }

    // Update user's monitoring zones for mining
    for (const zone of zones) {
      const existingZoneIndex = user.zonesOfInterest.findIndex((z) => z.name === zone.name)

      const zoneConfig = {
        name: zone.name,
        description: zone.description || `Mining expansion monitoring for ${zone.name}`,
        geometry: zone.coordinates,
        monitoringSettings: {
          mining: {
            enabled: true,
            expansionThreshold: monitoringSettings?.expansionThreshold || 10, // percentage
            checkInterval: monitoringSettings?.checkInterval || "weekly",
            alertSeverity: monitoringSettings?.alertSeverity || "medium",
            notificationMethods: monitoringSettings?.notificationMethods || ["email"],
            monitoringTypes: monitoringSettings?.monitoringTypes || ["surface", "underground", "quarry"],
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
      message: "Mining expansion monitoring configured successfully",
      monitoredZones: zones.length,
      monitoringSettings: monitoringSettings,
    })
  } catch (error) {
    console.error("Error setting up mining monitoring:", error)
    res.status(500).json({ error: "Failed to setup mining monitoring" })
  }
}

// Helper functions
const createMiningAlert = async (userId, segmentationResult, summary) => {
  try {
    const severity = summary.totalMiningSites > 5 ? "high" : summary.totalMiningSites > 2 ? "medium" : "low"

    const alert = new Alert({
      userId: userId || "system",
      zoneId: segmentationResult._id.toString(),
      alertType: "mining",
      severity,
      title: `Mining Activity Detected`,
      message: `${summary.totalMiningSites} mining site(s) detected in ${segmentationResult.zoneName}. Total affected area: ${summary.totalAffectedArea.toFixed(2)} hectares.`,
      coordinates: segmentationResult.coordinates.center,
      affectedArea: summary.totalAffectedArea,
      confidence: summary.confidenceScore,
      metadata: {
        detectionClass: "mining_activity",
        segmentationResultId: segmentationResult._id,
        analysisType: "mining_detection",
        totalMiningSites: summary.totalMiningSites,
        miningTypes: summary.miningTypes,
        environmentalImpact: summary.environmentalImpact,
      },
    })

    await alert.save()
    return alert
  } catch (error) {
    console.error("Error creating mining alert:", error)
  }
}
