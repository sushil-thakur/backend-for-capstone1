import SegmentationResult from "../models/SegmentationResult.js"
import { spawn } from "child_process"
import path from "path"
import { fileURLToPath } from "url"
import mongoose from "mongoose"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Default ObjectId for anonymous users
const ANONYMOUS_USER_ID = new mongoose.Types.ObjectId("000000000000000000000000")

// Estimate building heights using DEM and satellite data
export const estimateBuildingHeights = async (req, res) => {
  try {
    const { coordinates, userId, analysisType = "buildings", resolution = "high" } = req.body

    if (!coordinates) {
      return res.status(400).json({ error: "Coordinates are required" })
    }

    let bounds
    if (coordinates.bounds) {
      bounds = coordinates.bounds
    } else if (coordinates.lat && coordinates.lng) {
      // Convert point + radius to bounds
      // Use provided radius or default to 1km for analysis area
      const radius = coordinates.radius || 1000 // default 1km radius in meters
      const radiusInDegrees = radius / 111000 // rough conversion from meters to degrees
      bounds = {
        minLat: coordinates.lat - radiusInDegrees,
        maxLat: coordinates.lat + radiusInDegrees,
        minLng: coordinates.lng - radiusInDegrees,
        maxLng: coordinates.lng + radiusInDegrees,
      }
    } else {
      return res.status(400).json({ 
        error: "Invalid coordinates format. Provide either 'bounds' object or 'lat'/'lng' with optional 'radius'" 
      })
    }

    const { minLat, minLng, maxLat, maxLng } = bounds

    // Validate area size
    const areaSize = (maxLat - minLat) * (maxLng - minLng) * 111 * 111 // km²
    if (areaSize > 100) {
      return res.status(400).json({ error: "Area too large for height analysis. Maximum 100 km²" })
    }

    const processingId = `height_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    // Convert resolution string to number for metadata
    const resolutionMap = {
      'high': 30,    // 30m resolution
      'medium': 90,  // 90m resolution  
      'low': 250     // 250m resolution
    }
    const resolutionValue = resolutionMap[resolution] || 30

    const segmentationResult = new SegmentationResult({
      userId: userId ? new mongoose.Types.ObjectId(userId) : ANONYMOUS_USER_ID,
      processingId,
      modelUsed: "building_height_estimation_v1",
      inputType: "geographic_bounds",
      confidence: 85, // Default confidence for height estimation
      coordinates: {
        bounds,
        center: {
          lat: (minLat + maxLat) / 2,
          lng: (minLng + maxLng) / 2,
        },
      },
      zoneName: `Height Analysis ${new Date().toISOString().split("T")[0]}`,
      status: "processing",
      analysisType: "geographic_area",
      environmentalRisk: "Low",
      metadata: {
        analysisType: "building_height",
        resolution: resolutionValue, // Now a number
        areaSize: areaSize.toFixed(4),
        processingStarted: new Date(),
        heightParameters: {
          demResolution: resolution === "high" ? "30m" : "90m",
          buildingDetectionThreshold: 3.0, // meters
          shadowAnalysis: true,
          stereoMatching: resolution === "high",
        },
      },
    })

    await segmentationResult.save()

    // Process height estimation
    const pythonScript = path.join(__dirname, "../scripts/height_estimation.py")
    const pythonExecutable = "python" // Use global Python instead of virtual environment
    
    // Create a temporary file for parameters to avoid JSON parsing issues in PowerShell
    const paramFile = path.join(__dirname, `../uploads/results/${processingId}_params.json`)
    
    // Write parameters to a temporary file
    const params = {
      bounds,
      processingId,
      resolution,
      analysisType,
      outputDir: path.join(__dirname, "../uploads/results"),
    }
    
    const fs = await import('fs')
    await fs.promises.writeFile(paramFile, JSON.stringify(params, null, 2))
    
    const pythonProcess = spawn(pythonExecutable, [
      pythonScript,
      `@${paramFile}`
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
      console.log(`Height estimation process completed with code ${code} for ${processingId}`)
      console.log(`Python stdout length: ${pythonOutput.length}`)
      console.log(`Python stderr length: ${pythonError.length}`)
      
      try {
        // Clean up parameter file
        try {
          await fs.promises.unlink(paramFile)
          console.log(`Cleaned up parameter file: ${paramFile}`)
        } catch (err) {
          console.warn(`Could not delete parameter file: ${err.message}`)
        }
        
        // Find the segmentation result in database
        const savedResult = await SegmentationResult.findOne({ processingId })
        if (!savedResult) {
          console.error(`SegmentationResult not found for processingId: ${processingId}`)
          return
        }
        console.log(`Found saved result for ${processingId}, current status: ${savedResult.status}`)
        
        if (code === 0 && pythonOutput) {
          console.log(`Parsing Python output for ${processingId}`)
          console.log(`Python output preview: ${pythonOutput.substring(0, 200)}...`)
          
          try {
            const results = JSON.parse(pythonOutput)
            console.log(`Parsed JSON successfully. Found ${results.buildings?.length || 0} buildings in results`)

            savedResult.status = "completed"
            
            // Transform building data to match the detections schema
            savedResult.detections = (results.buildings || []).map(building => ({
              class: "urban_expansion", // Use valid enum value for buildings/urban structures
              confidence: building.confidence * 100, // Convert to percentage
              bbox: [
                building.coordinates.lng - 0.0001, // x (longitude - small offset for bbox)
                building.coordinates.lat - 0.0001, // y (latitude - small offset for bbox)  
                0.0002, // width (small bbox around the building)
                0.0002  // height (small bbox around the building)
              ],
              center: [building.coordinates.lng, building.coordinates.lat], // [longitude, latitude]
              area: Math.pow(building.estimatedHeight / 10, 2), // Estimated building footprint
              severity: building.category === "skyscraper" ? "high" : 
                       building.category === "high" ? "medium" : "low",
              // Add building-specific data to additionalInfo
              additionalInfo: {
                buildingId: building.buildingId,
                estimatedHeight: building.estimatedHeight,
                groundElevation: building.groundElevation,
                floorEstimate: building.floorEstimate,
                detectionMethod: building.detectionMethod,
                metadata: building.metadata,
                category: building.category
              }
            }))
            savedResult.summary = {
              totalBuildings: results.summary?.totalBuildings || 0,
              averageHeight: results.summary?.averageHeight || 0,
              maxHeight: results.summary?.maxHeight || 0,
              minHeight: results.summary?.minHeight || 0,
              heightDistribution: results.summary?.heightDistribution || {},
              confidenceScore: results.summary?.confidenceScore || 0,
              heightStdDev: results.summary?.heightStdDev || 0,
              averageConfidence: results.summary?.averageConfidence || 0,
            }
            savedResult.metadata.processingCompleted = new Date()
            savedResult.metadata.processingTime = Date.now() - savedResult.createdAt.getTime()
            savedResult.metadata.statistics = results.statistics || {}
            savedResult.metadata.heightMap = results.heightMap || {}

            await savedResult.save()
            console.log(`Successfully saved results for ${processingId} with status: completed`)
            console.log(`Final saved result summary: ${JSON.stringify(savedResult.summary)}`)
          } catch (parseError) {
            console.error(`JSON parsing error for ${processingId}:`, parseError)
            console.error(`Raw Python output: ${pythonOutput}`)
            savedResult.status = "failed"
            savedResult.metadata.error = `JSON parsing error: ${parseError.message}`
            await savedResult.save()
          }
        } else {
          console.error(`Height estimation failed for ${processingId}. Code: ${code}, Error: ${pythonError}`)
          savedResult.status = "failed"
          savedResult.metadata.error = pythonError || `Process failed with code ${code}`
          await savedResult.save()
          console.log(`Saved failed status for ${processingId}`)
        }
      } catch (error) {
        console.error(`Error processing height estimation results for ${processingId}:`, error)
        try {
          const savedResult = await SegmentationResult.findOne({ processingId })
          if (savedResult) {
            savedResult.status = "failed"
            savedResult.metadata.error = error.message
            await savedResult.save()
          }
        } catch (saveError) {
          console.error(`Failed to save error status for ${processingId}:`, saveError)
        }
      }
    })

    // Return immediate response
    res.status(202).json({
      message: "Height estimation started",
      processingId,
      estimatedTime: "10-30 seconds",
      status: "processing",
    })
  } catch (error) {
    console.error("Error in height estimation:", error)
    res.status(500).json({ error: "Failed to start height estimation" })
  }
}

// Batch process multiple buildings for height estimation
export const batchHeightEstimation = async (req, res) => {
  try {
    const { buildings, userId, priority = "normal" } = req.body

    if (!buildings || !Array.isArray(buildings) || buildings.length === 0) {
      return res.status(400).json({ error: "Buildings array is required" })
    }

    if (buildings.length > 1000) {
      return res.status(400).json({ error: "Maximum 1000 buildings per batch" })
    }

    const batchId = `batch_height_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    const results = []

    // Process buildings in chunks
    const chunkSize = 50
    for (let i = 0; i < buildings.length; i += chunkSize) {
      const chunk = buildings.slice(i, i + chunkSize)

      const processingId = `${batchId}_chunk_${Math.floor(i / chunkSize)}`

      const segmentationResult = new SegmentationResult({
        userId: userId ? new mongoose.Types.ObjectId(userId) : ANONYMOUS_USER_ID,
        processingId,
        modelUsed: "batch_height_estimation_v1",
        inputType: "building_coordinates",
        confidence: 80, // Default confidence for batch height estimation
        coordinates: {
          buildings: chunk.map((b) => ({ lat: b.lat, lng: b.lng, id: b.id })),
        },
        zoneName: `Batch Height Analysis ${Math.floor(i / chunkSize) + 1}`,
        status: "processing",
        analysisType: "geographic_area",
        environmentalRisk: "Low",
        metadata: {
          analysisType: "batch_building_height",
          batchId,
          chunkIndex: Math.floor(i / chunkSize),
          totalBuildings: chunk.length,
          priority,
          resolution: 30, // Default resolution for batch processing
          processingStarted: new Date(),
        },
      })

      await segmentationResult.save()
      results.push({
        processingId,
        buildingCount: chunk.length,
        status: "queued",
      })
    }

    // Start batch processing
    processBatchHeights(batchId, buildings, userId)

    res.status(202).json({
      message: "Batch height estimation started",
      batchId,
      totalBuildings: buildings.length,
      chunks: results.length,
      estimatedTime: `${Math.ceil(buildings.length / 10)} seconds`,
      results,
    })
  } catch (error) {
    console.error("Error in batch height estimation:", error)
    res.status(500).json({ error: "Failed to start batch height estimation" })
  }
}

// Get height estimation results
export const getHeightResults = async (req, res) => {
  try {
    const { processingId } = req.params

    const result = await SegmentationResult.findOne({ processingId })
    if (!result) {
      return res.status(404).json({ error: "Height analysis result not found" })
    }

    res.status(200).json({
      processingId,
      status: result.status,
      summary: result.summary,
      buildings: result.detections,
      metadata: result.metadata,
      createdAt: result.createdAt,
    })
  } catch (error) {
    console.error("Error getting height results:", error)
    res.status(500).json({ error: "Failed to get height results" })
  }
}

// Get height statistics for an area
export const getHeightStatistics = async (req, res) => {
  try {
    const { bounds, timeframe = "30days" } = req.query

    if (!bounds) {
      return res.status(400).json({ error: "Bounds parameter is required" })
    }

    const boundsObj = JSON.parse(bounds)
    const startDate = new Date(Date.now() - getTimeframeMs(timeframe))

    const statistics = await SegmentationResult.aggregate([
      {
        $match: {
          "metadata.analysisType": "building_height",
          status: "completed",
          createdAt: { $gte: startDate },
          "coordinates.bounds": {
            $geoIntersects: {
              $geometry: {
                type: "Polygon",
                coordinates: [
                  [
                    [boundsObj.minLng, boundsObj.minLat],
                    [boundsObj.maxLng, boundsObj.minLat],
                    [boundsObj.maxLng, boundsObj.maxLat],
                    [boundsObj.minLng, boundsObj.maxLat],
                    [boundsObj.minLng, boundsObj.minLat],
                  ],
                ],
              },
            },
          },
        },
      },
      {
        $group: {
          _id: null,
          totalBuildings: { $sum: "$summary.totalBuildings" },
          averageHeight: { $avg: "$summary.averageHeight" },
          maxHeight: { $max: "$summary.maxHeight" },
          minHeight: { $min: "$summary.minHeight" },
          analysisCount: { $sum: 1 },
        },
      },
    ])

    const stats = statistics[0] || {
      totalBuildings: 0,
      averageHeight: 0,
      maxHeight: 0,
      minHeight: 0,
      analysisCount: 0,
    }

    res.status(200).json({
      statistics: stats,
      timeframe,
      area: boundsObj,
    })
  } catch (error) {
    console.error("Error getting height statistics:", error)
    res.status(500).json({ error: "Failed to get height statistics" })
  }
}

// Helper functions
const processBatchHeights = async (batchId, buildings, userId) => {
  try {
    const pythonScript = path.join(__dirname, "../scripts/batch_height_estimation.py")
    const pythonExecutable = "python" // Use global Python instead of virtual environment
    
    // Create parameter file for batch processing
    const paramFile = path.join(__dirname, `../uploads/results/${batchId}_batch_params.json`)
    const params = {
      batchId,
      buildings,
      userId,
      outputDir: path.join(__dirname, "../uploads/results"),
    }
    
    const fs = await import('fs')
    await fs.promises.writeFile(paramFile, JSON.stringify(params, null, 2))
    
    const pythonProcess = spawn(pythonExecutable, [
      pythonScript,
      `@${paramFile}`
    ])

    pythonProcess.on("close", async (code) => {
      console.log(`Batch height estimation ${batchId} completed with code ${code}`)
      
      // Clean up parameter file
      try {
        await fs.promises.unlink(paramFile)
      } catch (err) {
        console.warn(`Could not delete batch parameter file: ${err.message}`)
      }
    })
  } catch (error) {
    console.error("Error in batch height processing:", error)
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
