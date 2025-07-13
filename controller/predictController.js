import PredictionResult from "../models/PredictionResult.js"
import { spawn } from "child_process"
import path from "path"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Predict property values with environmental factors
export const predictPropertyValue = async (req, res) => {
  try {
    const { coordinates, propertyDetails, userId, predictionType = "comprehensive", timeHorizon = "5years" } = req.body

    if (!coordinates || !coordinates.lat || !coordinates.lng) {
      return res.status(400).json({ error: "Property coordinates are required" })
    }

    if (!propertyDetails) {
      return res.status(400).json({ error: "Property details are required" })
    }

    const processingId = `prediction_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    // Create prediction record
    const predictionResult = new PredictionResult({
      userId: userId || "anonymous",
      processingId,
      modelUsed: "environmental_real_estate_v3",
      inputType: "property_analysis",
      coordinates: {
        lat: coordinates.lat,
        lng: coordinates.lng,
      },
      propertyDetails: {
        type: propertyDetails.type || "residential",
        size: propertyDetails.size || 0,
        bedrooms: propertyDetails.bedrooms || 0,
        bathrooms: propertyDetails.bathrooms || 0,
        yearBuilt: propertyDetails.yearBuilt || new Date().getFullYear(),
        lotSize: propertyDetails.lotSize || 0,
        features: propertyDetails.features || [],
      },
      status: "processing",
      metadata: {
        predictionType,
        timeHorizon,
        processingStarted: new Date(),
        environmentalFactors: {
          deforestationRisk: true,
          miningProximity: true,
          fireRisk: true,
          floodRisk: true,
          airQuality: true,
          noiseLevel: true,
          greenSpaceAccess: true,
        },
      },
    })

    await predictionResult.save()

    // Process prediction with XGBoost model
    const pythonScript = path.join(__dirname, "../scripts/run_xgboost_model.py")
    const pythonExecutable = "e:/environment/.venv/Scripts/python.exe"
    
    // Create a temporary file for parameters to avoid JSON parsing issues in PowerShell
    const paramFile = path.join(__dirname, `../uploads/results/${processingId}_params.json`)
    
    // Write parameters to a temporary file
    const params = {
      coordinates,
      propertyDetails,
      predictionType,
      timeHorizon,
      processingId,
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
      console.log(`Property prediction process completed with code ${code} for ${processingId}`)
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
        
        if (code === 0 && pythonOutput) {
          console.log(`Parsing Python output for ${processingId}`)
          console.log(`Python output preview: ${pythonOutput.substring(0, 200)}...`)
          
          try {
            const results = JSON.parse(pythonOutput)
            console.log(`Parsed JSON successfully. Prediction result: $${results.prediction?.estimatedPrice || 'N/A'}`)

            predictionResult.status = "completed"
            predictionResult.prediction = {
              estimatedPrice: results.prediction?.estimatedPrice || 0,
              priceRange: results.prediction?.priceRange || { min: 0, max: 0 },
              confidence: results.prediction?.confidence || 0,
              growthPotential: results.prediction?.growthPotential || "stable",
              investmentGrade: results.prediction?.investmentGrade || "C",
              environmentalScore: results.prediction?.environmentalScore || 0,
            }
            predictionResult.analysis = {
              marketFactors: results.analysis?.marketFactors || {},
              environmentalFactors: results.analysis?.environmentalFactors || {},
              locationFactors: results.analysis?.locationFactors || {},
              riskAssessment: results.analysis?.riskAssessment || {},
              comparableProperties: results.analysis?.comparableProperties || [],
            }
            predictionResult.metadata.processingCompleted = new Date()
            predictionResult.metadata.processingTime = Date.now() - predictionResult.createdAt.getTime()
            predictionResult.metadata.modelInfo = results.modelInfo || {}

            await predictionResult.save()
            console.log(`Successfully saved prediction result for ${processingId}`)
          } catch (parseError) {
            console.error(`Error parsing Python output for ${processingId}:`, parseError)
            predictionResult.status = "failed"
            predictionResult.metadata.error = `Failed to parse prediction results: ${parseError.message}`
            await predictionResult.save()
          }
        } else {
          console.error(`Python process failed with code ${code} for ${processingId}`)
          console.error(`Python stderr: ${pythonError}`)
          predictionResult.status = "failed"
          predictionResult.metadata.error = pythonError || "Property prediction failed"
          await predictionResult.save()
        }
      } catch (error) {
        console.error("Error processing prediction results:", error)
        try {
          predictionResult.status = "failed"
          predictionResult.metadata.error = `Processing error: ${error.message}`
          await predictionResult.save()
        } catch (saveError) {
          console.error("Error saving failed result:", saveError)
        }
      }
    })

    // Return immediate response
    res.status(202).json({
      message: "Property prediction started",
      processingId,
      estimatedTime: "2-5 minutes",
      status: "processing",
    })
  } catch (error) {
    console.error("Error in property prediction:", error)
    res.status(500).json({ error: "Failed to start property prediction" })
  }
}

// Assess environmental risks for property
export const assessEnvironmentalRisk = async (req, res) => {
  try {
    const { coordinates, riskRadius = 5000, riskTypes = "all" } = req.body

    if (!coordinates || !coordinates.lat || !coordinates.lng) {
      return res.status(400).json({ error: "Property coordinates are required" })
    }

    const processingId = `env_risk_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    // Create risk assessment bounds
    const radiusInDegrees = riskRadius / 111000
    const bounds = {
      minLat: coordinates.lat - radiusInDegrees,
      maxLat: coordinates.lat + radiusInDegrees,
      minLng: coordinates.lng - radiusInDegrees,
      maxLng: coordinates.lng + radiusInDegrees,
    }

    // Process environmental risk assessment
    const pythonScript = path.join(__dirname, "../scripts/environmental_risk_assessment.py")
    const pythonProcess = spawn("python", [
      pythonScript,
      JSON.stringify({
        coordinates,
        bounds,
        riskRadius,
        riskTypes,
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
              environmentalRisks: {
                deforestation: results.risks?.deforestation || { level: "low", score: 0 },
                mining: results.risks?.mining || { level: "low", score: 0 },
                fire: results.risks?.fire || { level: "low", score: 0 },
                flood: results.risks?.flood || { level: "low", score: 0 },
                airPollution: results.risks?.airPollution || { level: "low", score: 0 },
                noisePollution: results.risks?.noisePollution || { level: "low", score: 0 },
              },
              proximityFactors: results.proximityFactors || {},
              mitigationStrategies: results.mitigationStrategies || [],
              insuranceRecommendations: results.insuranceRecommendations || [],
              propertyValueImpact: results.propertyValueImpact || {},
            },
          })
        } else {
          res.status(500).json({
            error: "Environmental risk assessment failed",
            details: pythonError,
            processingId,
          })
        }
      } catch (error) {
        console.error("Error processing risk assessment:", error)
        res.status(500).json({ error: "Failed to process risk assessment" })
      }
    })
  } catch (error) {
    console.error("Error in environmental risk assessment:", error)
    res.status(500).json({ error: "Failed to start environmental risk assessment" })
  }
}

// Get market trends with environmental factors
export const getMarketTrends = async (req, res) => {
  try {
    const { region, propertyType = "all", timeframe = "2years", includeEnvironmental = true } = req.query

    const startDate = new Date(Date.now() - getTimeframeMs(timeframe))

    const query = {
      status: "completed",
      createdAt: { $gte: startDate },
    }

    if (propertyType !== "all") {
      query["propertyDetails.type"] = propertyType
    }

    const predictions = await PredictionResult.find(query).sort({ createdAt: -1 }).limit(1000)

    // Analyze trends
    const trends = analyzeTrends(predictions, includeEnvironmental)

    res.status(200).json({
      trends,
      summary: {
        totalPredictions: predictions.length,
        averagePrice: trends.averagePrice,
        priceGrowth: trends.priceGrowth,
        environmentalImpact: trends.environmentalImpact,
        marketSentiment: trends.marketSentiment,
      },
      timeframe,
      region: region || "all",
    })
  } catch (error) {
    console.error("Error getting market trends:", error)
    res.status(500).json({ error: "Failed to get market trends" })
  }
}

// Investment analysis with environmental considerations
export const analyzeInvestment = async (req, res) => {
  try {
    const { properties, investmentGoals, riskTolerance = "medium", timeHorizon = "10years", userId } = req.body

    if (!properties || !Array.isArray(properties) || properties.length === 0) {
      return res.status(400).json({ error: "Properties array is required" })
    }

    const processingId = `investment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    // Process investment analysis
    const pythonScript = path.join(__dirname, "../scripts/investment_analysis.py")
    const pythonProcess = spawn("python", [
      pythonScript,
      JSON.stringify({
        properties,
        investmentGoals: investmentGoals || { type: "growth", targetReturn: 8 },
        riskTolerance,
        timeHorizon,
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

          // Save investment analysis result
          const predictionResult = new PredictionResult({
            userId: userId || "anonymous",
            processingId,
            modelUsed: "investment_analysis_v2",
            inputType: "portfolio_analysis",
            status: "completed",
            prediction: {
              portfolioValue: results.portfolioValue || 0,
              expectedReturn: results.expectedReturn || 0,
              riskScore: results.riskScore || 0,
              confidence: results.confidence || 0,
              investmentGrade: results.investmentGrade || "C",
            },
            analysis: {
              propertyAnalysis: results.propertyAnalysis || [],
              portfolioOptimization: results.portfolioOptimization || {},
              riskAnalysis: results.riskAnalysis || {},
              environmentalFactors: results.environmentalFactors || {},
            },
            metadata: {
              analysisType: "investment_portfolio",
              timeHorizon,
              riskTolerance,
              processingCompleted: new Date(),
            },
          })

          await predictionResult.save()

          res.status(200).json({
            success: true,
            processingId,
            investmentAnalysis: {
              portfolioSummary: results.portfolioSummary,
              propertyRankings: results.propertyRankings,
              riskAssessment: results.riskAssessment,
              recommendations: results.recommendations,
              environmentalConsiderations: results.environmentalConsiderations,
              financialProjections: results.financialProjections,
              diversificationAdvice: results.diversificationAdvice,
            },
          })
        } else {
          res.status(500).json({
            error: "Investment analysis failed",
            details: pythonError,
            processingId,
          })
        }
      } catch (error) {
        console.error("Error processing investment analysis:", error)
        res.status(500).json({ error: "Failed to process investment analysis" })
      }
    })

    // Return immediate response
    res.status(202).json({
      message: "Investment analysis started",
      processingId,
      estimatedTime: "3-8 minutes",
      status: "processing",
    })
  } catch (error) {
    console.error("Error in investment analysis:", error)
    res.status(500).json({ error: "Failed to start investment analysis" })
  }
}

// Get prediction results
export const getPredictionResults = async (req, res) => {
  try {
    const { processingId } = req.params

    const result = await PredictionResult.findOne({ processingId })
    if (!result) {
      return res.status(404).json({ error: "Prediction result not found" })
    }

    res.status(200).json({
      processingId,
      status: result.status,
      prediction: result.prediction,
      analysis: result.analysis,
      propertyDetails: result.propertyDetails,
      coordinates: result.coordinates,
      metadata: result.metadata,
      createdAt: result.createdAt,
    })
  } catch (error) {
    console.error("Error getting prediction results:", error)
    res.status(500).json({ error: "Failed to get prediction results" })
  }
}

// Helper functions
const getTimeframeMs = (timeframe) => {
  const timeframes = {
    "6months": 6 * 30 * 24 * 60 * 60 * 1000,
    "1year": 365 * 24 * 60 * 60 * 1000,
    "2years": 2 * 365 * 24 * 60 * 60 * 1000,
    "5years": 5 * 365 * 24 * 60 * 60 * 1000,
  }
  return timeframes[timeframe] || timeframes["1year"]
}

const analyzeTrends = (predictions, includeEnvironmental) => {
  if (predictions.length === 0) {
    return { averagePrice: 0, priceGrowth: 0, environmentalImpact: 0, marketSentiment: "neutral" }
  }

  const prices = predictions.map((p) => p.prediction?.estimatedPrice || 0).filter((p) => p > 0)
  const environmentalScores = predictions.map((p) => p.prediction?.environmentalScore || 0)

  const averagePrice = prices.reduce((sum, price) => sum + price, 0) / prices.length
  const averageEnvScore = environmentalScores.reduce((sum, score) => sum + score, 0) / environmentalScores.length

  // Calculate price growth trend
  const recent = predictions.slice(0, Math.floor(predictions.length / 3))
  const older = predictions.slice(-Math.floor(predictions.length / 3))

  const recentAvgPrice = recent.reduce((sum, p) => sum + (p.prediction?.estimatedPrice || 0), 0) / recent.length
  const olderAvgPrice = older.reduce((sum, p) => sum + (p.prediction?.estimatedPrice || 0), 0) / older.length

  const priceGrowth = olderAvgPrice > 0 ? ((recentAvgPrice - olderAvgPrice) / olderAvgPrice) * 100 : 0

  return {
    averagePrice: averagePrice.toFixed(2),
    priceGrowth: priceGrowth.toFixed(2),
    environmentalImpact: includeEnvironmental ? averageEnvScore.toFixed(2) : null,
    marketSentiment: priceGrowth > 5 ? "bullish" : priceGrowth < -5 ? "bearish" : "neutral",
    totalProperties: predictions.length,
    priceRange: {
      min: Math.min(...prices),
      max: Math.max(...prices),
    },
  }
}
