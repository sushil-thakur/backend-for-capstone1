import SegmentationResult from "../models/SegmentationResult.js"
import Alert from "../models/Alerts.js"
import User from "../models/User.js"

// Get all detection layers for map visualization
export const getMapLayers = async (req, res) => {
  try {
    const { detectionTypes, bounds, timeRange, userId } = req.query

    let query = {}
    if (userId) query.userId = userId

    // Filter by detection types
    if (detectionTypes) {
      const types = detectionTypes.split(",")
      query["detections.class"] = { $in: types }
    }

    // Filter by geographic bounds
    if (bounds) {
      const [minLat, minLng, maxLat, maxLng] = bounds.split(",").map(Number)
      query["metadata.bounds.0"] = { $gte: minLat }
      query["metadata.bounds.1"] = { $gte: minLng }
      query["metadata.bounds.2"] = { $lte: maxLat }
      query["metadata.bounds.3"] = { $lte: maxLng }
    }

    // Filter by time range
    if (timeRange) {
      const [startDate, endDate] = timeRange.split(",")
      query.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      }
    }

    const results = await SegmentationResult.find(query).sort({ createdAt: -1 }).limit(100)

    // Group detections by type for layer organization
    const layers = {}
    const allDetections = []

    results.forEach((result) => {
      result.detections.forEach((detection) => {
        const layerType = detection.class
        if (!layers[layerType]) {
          layers[layerType] = {
            type: "FeatureCollection",
            features: [],
            statistics: {
              count: 0,
              averageConfidence: 0,
              totalArea: 0,
            },
          }
        }

        const feature = {
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: detection.center || [0, 0],
          },
          properties: {
            id: detection._id || `${layerType}_${Date.now()}`,
            class: detection.class,
            confidence: detection.confidence,
            severity: detection.severity,
            area: detection.area,
            zoneName: result.zoneName,
            detectedAt: result.createdAt,
            segmentationId: result._id,
          },
        }

        layers[layerType].features.push(feature)
        layers[layerType].statistics.count++
        layers[layerType].statistics.totalArea += detection.area || 0
        allDetections.push(detection)
      })
    })

    // Calculate statistics for each layer
    Object.keys(layers).forEach((layerType) => {
      const layer = layers[layerType]
      const confidences = layer.features.map((f) => f.properties.confidence)
      layer.statistics.averageConfidence =
        confidences.length > 0 ? confidences.reduce((sum, c) => sum + c, 0) / confidences.length : 0
    })

    res.status(200).json({
      success: true,
      layers,
      metadata: {
        totalResults: results.length,
        totalDetections: allDetections.length,
        layerTypes: Object.keys(layers),
        bounds: bounds ? bounds.split(",").map(Number) : null,
        timeRange: timeRange ? timeRange.split(",") : null,
      },
    })
  } catch (error) {
    console.error("Get map layers error:", error)
    res.status(500).json({
      error: "Failed to retrieve map layers",
      details: error.message,
    })
  }
}

// Analyze specific coordinates
export const analyzeCoordinates = async (req, res) => {
  try {
    const { latitude, longitude, radius = 1000, detectionTypes } = req.body

    if (!latitude || !longitude) {
      return res.status(400).json({ error: "Latitude and longitude are required" })
    }

    // Calculate bounds based on radius (approximate)
    const radiusInDegrees = radius / 111320 // Convert meters to degrees (approximate)
    const bounds = [
      latitude - radiusInDegrees,
      longitude - radiusInDegrees,
      latitude + radiusInDegrees,
      longitude + radiusInDegrees,
    ]

    // Find segmentation results within the area
    const query = {
      "metadata.bounds.0": { $lte: bounds[2] },
      "metadata.bounds.1": { $lte: bounds[3] },
      "metadata.bounds.2": { $gte: bounds[0] },
      "metadata.bounds.3": { $gte: bounds[1] },
    }

    if (detectionTypes && detectionTypes.length > 0) {
      query["detections.class"] = { $in: detectionTypes }
    }

    const results = await SegmentationResult.find(query).sort({ createdAt: -1 })

    // Filter detections within the radius
    const nearbyDetections = []
    results.forEach((result) => {
      result.detections.forEach((detection) => {
        if (detection.center) {
          const distance = calculateDistance(latitude, longitude, detection.center[1], detection.center[0])
          if (distance <= radius) {
            nearbyDetections.push({
              ...detection.toObject(),
              distance,
              segmentationId: result._id,
              zoneName: result.zoneName,
              detectedAt: result.createdAt,
            })
          }
        }
      })
    })

    // Get recent alerts in the area
    const recentAlerts = await Alert.find({
      "coordinates.latitude": {
        $gte: latitude - radiusInDegrees,
        $lte: latitude + radiusInDegrees,
      },
      "coordinates.longitude": {
        $gte: longitude - radiusInDegrees,
        $lte: longitude + radiusInDegrees,
      },
      createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }, // Last 30 days
    })
      .sort({ createdAt: -1 })
      .limit(10)

    // Calculate environmental risk for the area
    const riskFactors = {
      deforestation: nearbyDetections.filter((d) => d.class === "deforestation").length,
      mining: nearbyDetections.filter((d) => d.class === "mining").length,
      forestFire: nearbyDetections.filter((d) => d.class === "forest_fire").length,
      criticalAlerts: recentAlerts.filter((a) => a.severity === "critical").length,
    }

    const overallRisk = calculateAreaRisk(riskFactors)

    res.status(200).json({
      success: true,
      analysis: {
        coordinates: { latitude, longitude },
        radius,
        detections: nearbyDetections,
        recentAlerts,
        riskAssessment: {
          overallRisk,
          riskFactors,
          recommendations: generateRecommendations(riskFactors),
        },
        statistics: {
          totalDetections: nearbyDetections.length,
          byType: nearbyDetections.reduce((acc, d) => {
            acc[d.class] = (acc[d.class] || 0) + 1
            return acc
          }, {}),
          averageConfidence:
            nearbyDetections.length > 0
              ? nearbyDetections.reduce((sum, d) => sum + d.confidence, 0) / nearbyDetections.length
              : 0,
        },
      },
    })
  } catch (error) {
    console.error("Coordinate analysis error:", error)
    res.status(500).json({
      error: "Failed to analyze coordinates",
      details: error.message,
    })
  }
}

// Get time series environmental data
export const getTimeSeries = async (req, res) => {
  try {
    const { bounds, timeInterval = "month", detectionTypes, startDate, endDate } = req.query

    if (!bounds) {
      return res.status(400).json({ error: "Bounds parameter is required" })
    }

    const [minLat, minLng, maxLat, maxLng] = bounds.split(",").map(Number)

    // Set default time range if not provided
    const end = endDate ? new Date(endDate) : new Date()
    const start = startDate ? new Date(startDate) : new Date(end.getTime() - 365 * 24 * 60 * 60 * 1000) // 1 year ago

    // Build query
    const query = {
      "metadata.bounds.0": { $lte: maxLat },
      "metadata.bounds.1": { $lte: maxLng },
      "metadata.bounds.2": { $gte: minLat },
      "metadata.bounds.3": { $gte: minLng },
      createdAt: { $gte: start, $lte: end },
    }

    if (detectionTypes) {
      const types = detectionTypes.split(",")
      query["detections.class"] = { $in: types }
    }

    const results = await SegmentationResult.find(query).sort({ createdAt: 1 })

    // Group data by time interval
    const timeSeriesData = {}
    const intervalMs = getIntervalMs(timeInterval)

    results.forEach((result) => {
      const timeKey = getTimeKey(result.createdAt, timeInterval)

      if (!timeSeriesData[timeKey]) {
        timeSeriesData[timeKey] = {
          timestamp: timeKey,
          detections: {},
          totalDetections: 0,
          environmentalRisk: "Low",
        }
      }

      result.detections.forEach((detection) => {
        const detectionType = detection.class
        if (!timeSeriesData[timeKey].detections[detectionType]) {
          timeSeriesData[timeKey].detections[detectionType] = 0
        }
        timeSeriesData[timeKey].detections[detectionType]++
        timeSeriesData[timeKey].totalDetections++
      })

      // Update environmental risk
      if (result.environmentalRisk === "Critical") {
        timeSeriesData[timeKey].environmentalRisk = "Critical"
      } else if (result.environmentalRisk === "High" && timeSeriesData[timeKey].environmentalRisk !== "Critical") {
        timeSeriesData[timeKey].environmentalRisk = "High"
      } else if (result.environmentalRisk === "Medium" && !["Critical", "High"].includes(timeSeriesData[timeKey].environmentalRisk)) {
        timeSeriesData[timeKey].environmentalRisk = "Medium"
      }
    })

    const sortedData = Object.values(timeSeriesData).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))

    res.status(200).json({
      success: true,
      timeSeries: sortedData,
      metadata: {
        bounds: [minLat, minLng, maxLat, maxLng],
        timeRange: { start, end },
        timeInterval,
        totalDataPoints: sortedData.length,
        detectionTypes: detectionTypes ? detectionTypes.split(",") : "all",
      },
    })
  } catch (error) {
    console.error("Time series error:", error)
    res.status(500).json({
      error: "Failed to retrieve time series data",
      details: error.message,
    })
  }
}

// Helper functions
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371e3 // Earth's radius in meters
  const φ1 = (lat1 * Math.PI) / 180
  const φ2 = (lat2 * Math.PI) / 180
  const Δφ = ((lat2 - lat1) * Math.PI) / 180
  const Δλ = ((lon2 - lon1) * Math.PI) / 180

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

  return R * c // Distance in meters
}

const calculateAreaRisk = (riskFactors) => {
  const { deforestation, mining, forestFire, criticalAlerts } = riskFactors

  if (criticalAlerts > 0 || forestFire > 0) return "Critical"
  if (mining > 2 || deforestation > 5) return "High"
  if (mining > 0 || deforestation > 2) return "Medium"
  return "Low"
}

const generateRecommendations = (riskFactors) => {
  const recommendations = []

  if (riskFactors.forestFire > 0) {
    recommendations.push("Immediate fire monitoring and suppression measures recommended")
  }
  if (riskFactors.mining > 2) {
    recommendations.push("Review mining permits and environmental compliance")
  }
  if (riskFactors.deforestation > 5) {
    recommendations.push("Implement forest conservation measures")
  }
  if (riskFactors.criticalAlerts > 0) {
    recommendations.push("Urgent attention required due to critical alerts")
  }

  if (recommendations.length === 0) {
    recommendations.push("Area appears stable, continue regular monitoring")
  }

  return recommendations
}

const getIntervalMs = (interval) => {
  switch (interval) {
    case "day":
      return 24 * 60 * 60 * 1000
    case "week":
      return 7 * 24 * 60 * 60 * 1000
    case "month":
      return 30 * 24 * 60 * 60 * 1000
    case "year":
      return 365 * 24 * 60 * 60 * 1000
    default:
      return 30 * 24 * 60 * 60 * 1000
  }
}

const getTimeKey = (date, interval) => {
  const d = new Date(date)
  switch (interval) {
    case "day":
      return d.toISOString().split("T")[0]
    case "week":
      const weekStart = new Date(d.setDate(d.getDate() - d.getDay()))
      return weekStart.toISOString().split("T")[0]
    case "month":
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
    case "year":
      return d.getFullYear().toString()
    default:
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
  }
}
