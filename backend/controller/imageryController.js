import { spawn } from "child_process"
import path from "path"
import { fileURLToPath } from "url"
import fs from "fs/promises"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Fetch satellite imagery for analysis
export const fetchSatelliteImagery = async (req, res) => {
  try {
    const { coordinates, imageType = "rgb", resolution = "medium", dateRange, cloudCover = 20, userId } = req.body

    if (!coordinates || !coordinates.bounds) {
      return res.status(400).json({ error: "Geographic bounds are required" })
    }

    const { minLat, minLng, maxLat, maxLng } = coordinates.bounds

    // Validate area size
    const areaSize = (maxLat - minLat) * (maxLng - minLng) * 111 * 111 // km²
    if (areaSize > 10000) {
      return res.status(400).json({ error: "Area too large. Maximum 10,000 km²" })
    }

    const processingId = `imagery_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    // Return immediate response first
    res.status(202).json({
      message: "Satellite imagery fetch started",
      processingId,
      estimatedTime: "2-5 minutes",
      status: "processing",
    })

    // Process satellite imagery fetch in background
    const pythonScript = path.join(__dirname, "../scripts/fetch_satellite_imagery.py")
    const pythonExecutable = "e:/environment/.venv/Scripts/python.exe"
    
    // Create a temporary file for parameters to avoid JSON parsing issues in PowerShell
    const paramFile = path.join(__dirname, `../uploads/results/${processingId}_params.json`)
    const resultFile = path.join(__dirname, `../uploads/results/${processingId}_result.json`)
    
    try {
      // Write parameters to a temporary file
      const params = {
        bounds: { minLat, minLng, maxLat, maxLng },
        imageType,
        resolution,
        dateRange: dateRange || { start: "2024-01-01", end: "2024-12-31" },
        cloudCover,
        processingId,
        outputDir: path.join(__dirname, "../uploads/imagery"),
      }
      await fs.writeFile(paramFile, JSON.stringify(params, null, 2))
      
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
        try {
          // Store results in file system for later retrieval
          const results = {
            processingId,
            status: code === 0 ? "completed" : "failed",
            timestamp: new Date().toISOString(),
            data: code === 0 && pythonOutput ? JSON.parse(pythonOutput) : null,
            error: code !== 0 ? pythonError : null
          }
          
          // Save results to file for retrieval via /api/imagery/results/{processingId}
          await fs.writeFile(resultFile, JSON.stringify(results, null, 2))
          console.log(`Imagery processing ${code === 0 ? 'completed' : 'failed'} for ${processingId}`)
          
          // Clean up parameter file
          try {
            await fs.unlink(paramFile)
          } catch (err) {
            console.warn(`Could not delete parameter file: ${err.message}`)
          }
          
        } catch (error) {
          console.error("Error processing imagery fetch:", error)
          // Save error result
          const errorResult = {
            processingId,
            status: "failed",
            timestamp: new Date().toISOString(),
            data: null,
            error: error.message
          }
          try {
            await fs.writeFile(resultFile, JSON.stringify(errorResult, null, 2))
          } catch (writeErr) {
            console.error("Failed to save error result:", writeErr)
          }
        }
      })
      
    } catch (error) {
      console.error("Error starting imagery processing:", error)
      // Save immediate error
      const errorResult = {
        processingId,
        status: "failed",
        timestamp: new Date().toISOString(),
        data: null,
        error: error.message
      }
      try {
        await fs.writeFile(resultFile, JSON.stringify(errorResult, null, 2))
      } catch (writeErr) {
        console.error("Failed to save error result:", writeErr)
      }
    }

  } catch (error) {
    console.error("Error fetching satellite imagery:", error)
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to fetch satellite imagery" })
    }
  }
}

// Get available satellite sources
export const getSatelliteSources = async (req, res) => {
  try {
    const sources = {
      sentinel2: {
        name: "Sentinel-2",
        resolution: "10m",
        bands: ["RGB", "NIR", "SWIR"],
        revisitTime: "5 days",
        coverage: "Global",
        provider: "ESA",
      },
      landsat8: {
        name: "Landsat 8",
        resolution: "30m",
        bands: ["RGB", "NIR", "SWIR", "Thermal"],
        revisitTime: "16 days",
        coverage: "Global",
        provider: "NASA/USGS",
      },
      modis: {
        name: "MODIS",
        resolution: "250m-1km",
        bands: ["RGB", "NIR", "Thermal"],
        revisitTime: "1-2 days",
        coverage: "Global",
        provider: "NASA",
      },
      planetScope: {
        name: "PlanetScope",
        resolution: "3m",
        bands: ["RGB", "NIR"],
        revisitTime: "Daily",
        coverage: "Global",
        provider: "Planet Labs",
      },
    }

    res.status(200).json({
      sources,
      recommendations: {
        deforestation: ["sentinel2", "landsat8"],
        mining: ["sentinel2", "planetScope"],
        fire: ["modis", "sentinel2"],
        urban: ["planetScope", "sentinel2"],
        agriculture: ["sentinel2", "landsat8"],
      },
    })
  } catch (error) {
    console.error("Error getting satellite sources:", error)
    res.status(500).json({ error: "Failed to get satellite sources" })
  }
}

// Compare imagery over time
export const compareImageryOverTime = async (req, res) => {
  try {
    const { coordinates, dates, analysisType = "change_detection" } = req.body

    if (!coordinates || !dates || !Array.isArray(dates) || dates.length < 2) {
      return res.status(400).json({ error: "Coordinates and at least 2 dates are required" })
    }

    const processingId = `comparison_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    // Return immediate response first
    res.status(202).json({
      message: "Imagery comparison started",
      processingId,
      estimatedTime: "3-8 minutes",
      status: "processing",
    })

    // Process temporal comparison in background
    const pythonScript = path.join(__dirname, "../scripts/temporal_imagery_comparison.py")
    const pythonProcess = spawn("python", [
      pythonScript,
      JSON.stringify({
        coordinates,
        dates,
        analysisType,
        processingId,
        outputDir: path.join(__dirname, "../uploads/comparisons"),
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
        // Store results for later retrieval, don't send response here
        const results = {
          processingId,
          status: code === 0 ? "completed" : "failed",
          timestamp: new Date().toISOString(),
          data: code === 0 && pythonOutput ? JSON.parse(pythonOutput) : null,
          error: code !== 0 ? pythonError : null
        }
        
        console.log(`Imagery comparison ${code === 0 ? 'completed' : 'failed'} for ${processingId}`)
        
      } catch (error) {
        console.error("Error processing imagery comparison:", error)
      }
    })

  } catch (error) {
    console.error("Error in imagery comparison:", error)
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to start imagery comparison" })
    }
  }
}

// Get imagery processing results
export const getImageryResults = async (req, res) => {
  try {
    const { processingId } = req.params
    const resultFile = path.join(__dirname, `../uploads/results/${processingId}_result.json`)

    try {
      // Try to read the result file
      const resultData = await fs.readFile(resultFile, 'utf8')
      const results = JSON.parse(resultData)
      
      res.status(200).json({
        processingId: results.processingId,
        status: results.status,
        timestamp: results.timestamp,
        ...(results.status === "completed" && results.data ? {
          results: {
            message: "Imagery processing completed successfully",
            images: results.data.images || [],
            metadata: results.data.metadata || {},
            downloadUrls: results.data.downloadUrls || [],
            previewUrls: results.data.previewUrls || []
          }
        } : {}),
        ...(results.status === "failed" && results.error ? {
          error: results.error
        } : {})
      })
      
    } catch (fileError) {
      // File doesn't exist or can't be read - processing might still be in progress
      if (fileError.code === 'ENOENT') {
        res.status(200).json({
          processingId,
          status: "processing",
          message: "Processing is still in progress. Please check back later.",
          timestamp: new Date().toISOString()
        })
      } else {
        throw fileError
      }
    }
    
  } catch (error) {
    console.error("Error getting imagery results:", error)
    res.status(500).json({ error: "Failed to get imagery results" })
  }
}
