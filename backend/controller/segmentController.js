import { spawn } from "child_process"
import path from "path"
import { fileURLToPath } from "url"
import SegmentationResult from "../models/SegmentationResult.js"
import Alert from "../models/Alerts.js"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Process satellite imagery for a geographic area
export const processGeographicArea = async (req, res) => {
  try {
    const {
      bounds, // [minLat, minLng, maxLat, maxLng]
      userId,
      zoneName,
      detectionTypes = ["deforestation", "mining", "forest_fire"],
      resolution = 10, // meters per pixel
      alertThreshold = 70,
    } = req.body

    if (!bounds || bounds.length !== 4) {
      return res.status(400).json({ error: "Valid bounds array [minLat, minLng, maxLat, maxLng] is required" })
    }

    const [minLat, minLng, maxLat, maxLng] = bounds

    // Validate bounds
    if (minLat >= maxLat || minLng >= maxLng) {
      return res.status(400).json({ error: "Invalid bounds: min values must be less than max values" })
    }

    // Calculate area size
    const areaKm2 = calculateAreaSize(minLat, minLng, maxLat, maxLng)

    if (areaKm2 > 1000) {
      // Limit to 1000 km²
      return res.status(400).json({
        error: "Area too large",
        message: `Requested area: ${areaKm2.toFixed(2)} km². Maximum allowed: 1000 km²`,
      })
    }

    // Process the geographic area using satellite data
    const result = await processAreaWithSatelliteData({
      bounds: [minLat, minLng, maxLat, maxLng],
      detectionTypes,
      resolution,
      userId,
      zoneName: zoneName || `Area_${Date.now()}`,
    })

    // Calculate environmental risk
    const environmentalRisk = calculateEnvironmentalRisk(result.detections)

    // Save to database
    const segmentationResult = new SegmentationResult({
      userId,
      zoneName: zoneName || `Area_${Date.now()}`,
      originalImagePath: null, // No image file for geographic processing
      resultImagePath: null, // No result image file
      modelUsed: "Satellite_Geographic_Analysis_v3.0",
      detections: result.detections,
      confidence: result.confidence,
      analysisType: "geographic_area",
      environmentalRisk,
      metadata: {
        processingTime: result.processingTime,
        areaSize: areaKm2,
        bounds: bounds,
        resolution: resolution,
        detectionTypes: detectionTypes,
        detectionCount: result.detections.length,
        satelliteSource: result.satelliteSource || "Sentinel-2",
        processingDate: new Date().toISOString(),
      },
    })

    await segmentationResult.save()

    // Create alerts for high-risk detections
    const alertsCreated = await createAlertsFromDetections(userId, zoneName, result.detections, alertThreshold)

    res.status(200).json({
      success: true,
      segmentationId: segmentationResult._id,
      area: {
        bounds: bounds,
        sizeKm2: areaKm2,
        resolution: `${resolution}m/pixel`,
      },
      detections: result.detections,
      confidence: result.confidence,
      environmentalRisk,
      processingTime: result.processingTime,
      alertsCreated,
      summary: {
        totalDetections: result.detections.length,
        byType: detectionTypes.reduce((acc, type) => {
          acc[type] = result.detections.filter((d) => d.class === type).length
          return acc
        }, {}),
        criticalDetections: result.detections.filter((d) => d.severity === "critical").length,
        highRiskDetections: result.detections.filter((d) => d.severity === "high").length,
      },
      mapVisualization: {
        geoJsonUrl: `/api/segment/geojson/${segmentationResult._id}`,
        layerUrls: detectionTypes.reduce((acc, type) => {
          acc[type] = `/api/segment/layer/${segmentationResult._id}/${type}`
          return acc
        }, {}),
      },
    })
  } catch (error) {
    console.error("Geographic area processing error:", error)
    res.status(500).json({
      error: "Geographic area processing failed",
      details: error.message,
    })
  }
}

// Get processed area as GeoJSON for map visualization
export const getAreaGeoJSON = async (req, res) => {
  try {
    const { segmentationId } = req.params
    const { detectionType } = req.query

    const result = await SegmentationResult.findById(segmentationId)
    if (!result) {
      return res.status(404).json({ error: "Segmentation result not found" })
    }

    let detections = result.detections
    if (detectionType) {
      detections = detections.filter((d) => d.class === detectionType)
    }

    const geoJson = {
      type: "FeatureCollection",
      features: detections.map((detection, index) => ({
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: detection.center || [0, 0],
        },
        properties: {
          id: detection._id || `detection_${index}`,
          class: detection.class,
          confidence: detection.confidence,
          severity: detection.severity,
          area: detection.area,
          bbox: detection.bbox,
          timestamp: result.createdAt,
          zoneName: result.zoneName,
          // Type-specific properties
          ...(detection.class === "mining" && {
            miningType: detection.additionalInfo?.miningType || "unknown",
            infrastructureDetected: detection.infrastructure_detected || false,
            aspectRatio: detection.aspect_ratio || 0,
            edgeDensity: detection.edge_density || 0,
          }),
          ...(detection.class === "forest_fire" && {
            fireType: detection.fire_type || "unknown",
            activeFire: detection.active_fire_ratio || 0,
            smokeRatio: detection.smoke_ratio || 0,
            burnedRatio: detection.burned_ratio || 0,
            heatSignature: detection.heat_signature || 0,
          }),
          ...(detection.class === "deforestation" && {
            vegetationLoss: detection.vegetation_loss || 0,
            shapeRegularity: detection.shape_regularity || 0,
            deforestationRate: detection.deforestation_rate || 0,
          }),
        },
      })),
    }

    res.status(200).json({
      success: true,
      geoJson,
      metadata: {
        totalFeatures: geoJson.features.length,
        detectionType: detectionType || "all",
        bounds: result.metadata.bounds,
        processingDate: result.createdAt,
        areaSize: result.metadata.areaSize,
      },
    })
  } catch (error) {
    console.error("GeoJSON generation error:", error)
    res.status(500).json({
      error: "Failed to generate GeoJSON",
      details: error.message,
    })
  }
}

// Get detection layer for specific type
export const getDetectionLayer = async (req, res) => {
  try {
    const { segmentationId, layerType } = req.params
    const { format = "geojson" } = req.query

    const result = await SegmentationResult.findById(segmentationId)
    if (!result) {
      return res.status(404).json({ error: "Segmentation result not found" })
    }

    const layerDetections = result.detections.filter((d) => d.class === layerType)

    if (format === "geojson") {
      const layerGeoJson = {
        type: "FeatureCollection",
        features: layerDetections.map((detection, index) => ({
          type: "Feature",
          geometry: {
            type: "Polygon",
            coordinates: [convertBboxToPolygon(detection.bbox)],
          },
          properties: {
            id: detection._id || `${layerType}_${index}`,
            class: detection.class,
            confidence: detection.confidence,
            severity: detection.severity,
            area: detection.area,
            center: detection.center,
            detectedAt: result.createdAt,
          },
        })),
      }

      const averageConfidence =
        layerDetections.length > 0
          ? layerDetections.reduce((sum, d) => sum + d.confidence, 0) / layerDetections.length
          : 0

      res.status(200).json({
        success: true,
        layer: layerGeoJson,
        statistics: {
          detectionCount: layerDetections.length,
          averageConfidence: Math.round(averageConfidence * 100) / 100,
          totalArea: layerDetections.reduce((sum, d) => sum + (d.area || 0), 0),
          severityDistribution: {
            low: layerDetections.filter((d) => d.severity === "low").length,
            medium: layerDetections.filter((d) => d.severity === "medium").length,
            high: layerDetections.filter((d) => d.severity === "high").length,
            critical: layerDetections.filter((d) => d.severity === "critical").length,
          },
        },
      })
    } else {
      res.status(400).json({ error: "Unsupported format. Use 'geojson'" })
    }
  } catch (error) {
    console.error("Detection layer error:", error)
    res.status(500).json({
      error: "Failed to generate detection layer",
      details: error.message,
    })
  }
}

// Get segmentation results (updated for geographic areas)
export const getSegmentationResults = async (req, res) => {
  try {
    const { userId } = req.params
    const { limit = 10, offset = 0, analysisType, environmentalRisk, bounds } = req.query

    const query = { userId }
    if (analysisType) query.analysisType = analysisType
    if (environmentalRisk) query.environmentalRisk = environmentalRisk

    // Filter by geographic bounds if provided
    if (bounds) {
      const [minLat, minLng, maxLat, maxLng] = bounds.split(",").map(Number)
      // Simple bounds filtering - in production you might want more sophisticated geospatial queries
      query["metadata.bounds.0"] = { $gte: minLat }
      query["metadata.bounds.1"] = { $gte: minLng }
      query["metadata.bounds.2"] = { $lte: maxLat }
      query["metadata.bounds.3"] = { $lte: maxLng }
    }

    const results = await SegmentationResult.find(query)
      .sort({ createdAt: -1 })
      .limit(Number.parseInt(limit))
      .skip(Number.parseInt(offset))

    const total = await SegmentationResult.countDocuments(query)

    res.status(200).json({
      results: results.map((result) => ({
        ...result.toObject(),
        mapVisualization: {
          geoJsonUrl: `/api/segment/geojson/${result._id}`,
          layerUrls:
            result.metadata.detectionTypes?.reduce((acc, type) => {
              acc[type] = `/api/segment/layer/${result._id}/${type}`
              return acc
            }, {}) || {},
        },
      })),
      pagination: {
        total,
        limit: Number.parseInt(limit),
        offset: Number.parseInt(offset),
        hasMore: offset + limit < total,
      },
    })
  } catch (error) {
    console.error("Get segmentation results error:", error)
    res.status(500).json({
      error: "Failed to retrieve segmentation results",
      details: error.message,
    })
  }
}

export const getSegmentationById = async (req, res) => {
  try {
    const { segmentationId } = req.params
    const result = await SegmentationResult.findById(segmentationId)

    if (!result) {
      return res.status(404).json({ error: "Segmentation result not found" })
    }

    res.status(200).json({
      ...result.toObject(),
      mapVisualization: {
        geoJsonUrl: `/api/segment/geojson/${result._id}`,
        layerUrls:
          result.metadata.detectionTypes?.reduce((acc, type) => {
            acc[type] = `/api/segment/layer/${result._id}/${type}`
            return acc
          }, {}) || {},
      },
    })
  } catch (error) {
    console.error("Get segmentation by ID error:", error)
    res.status(500).json({
      error: "Failed to retrieve segmentation result",
      details: error.message,
    })
  }
}

// Helper functions
const processAreaWithSatelliteData = async (params) => {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, "../scripts/process_satellite_area.py")
    const pythonProcess = spawn("python", [scriptPath, JSON.stringify(params)])

    let stdout = ""
    let stderr = ""

    pythonProcess.stdout.on("data", (data) => {
      stdout += data.toString()
    })

    pythonProcess.stderr.on("data", (data) => {
      stderr += data.toString()
    })

    pythonProcess.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`Satellite processing failed: ${stderr}`))
        return
      }

      try {
        const result = JSON.parse(stdout)
        resolve(result)
      } catch (error) {
        reject(new Error(`Failed to parse satellite processing output: ${error.message}`))
      }
    })

    pythonProcess.on("error", (error) => {
      reject(new Error(`Failed to start satellite processing: ${error.message}`))
    })
  })
}

const calculateAreaSize = (minLat, minLng, maxLat, maxLng) => {
  // Approximate area calculation using Haversine formula
  const R = 6371 // Earth's radius in km
  const avgLat = (minLat + maxLat) / 2
  const latDistance = (maxLat - minLat) * 111.32 // km per degree latitude
  const lngDistance = (maxLng - minLng) * 111.32 * Math.cos((avgLat * Math.PI) / 180)

  return latDistance * lngDistance
}

const convertBboxToPolygon = (bbox) => {
  if (!bbox || bbox.length !== 4) {
    // Return a default small polygon if bbox is invalid
    return [
      [0, 0],
      [0.001, 0],
      [0.001, 0.001],
      [0, 0.001],
      [0, 0],
    ]
  }

  const [x, y, width, height] = bbox
  return [
    [x, y],
    [x + width, y],
    [x + width, y + height],
    [x, y + height],
    [x, y], // Close the polygon
  ]
}

const calculateEnvironmentalRisk = (detections) => {
  if (!detections || detections.length === 0) return "Low"

  const criticalCount = detections.filter((d) => d.severity === "critical").length
  const highCount = detections.filter((d) => d.severity === "high").length
  const fireDetections = detections.filter((d) => d.class === "forest_fire").length
  const miningDetections = detections.filter((d) => d.class === "mining").length

  if (criticalCount > 2 || fireDetections > 0) return "Critical"
  if (criticalCount > 0 || highCount > 2 || miningDetections > 1) return "High"
  if (highCount > 0) return "Medium"
  return "Low"
}

const createAlertsFromDetections = async (userId, zoneName, detections, threshold = 70) => {
  let alertsCreated = 0

  for (const detection of detections) {
    if (detection.confidence >= threshold) {
      try {
        const alert = new Alert({
          userId,
          zoneId: zoneName,
          alertType: detection.class,
          severity: detection.severity || "medium",
          title: `${detection.class.replace("_", " ").toUpperCase()} Detected`,
          message: `${detection.class.replace("_", " ")} detected with ${detection.confidence}% confidence in ${zoneName}`,
          coordinates: {
            latitude: detection.center ? detection.center[1] : null,
            longitude: detection.center ? detection.center[0] : null,
          },
          affectedArea: detection.area || 0,
          confidence: detection.confidence,
          metadata: {
            detectionClass: detection.class,
            boundingBox: detection.bbox,
            additionalInfo: detection,
          },
        })

        await alert.save()
        alertsCreated++
      } catch (error) {
        console.error("Error creating alert:", error)
      }
    }
  }

  return alertsCreated
}
