// test-height.js - Simple test script for height estimation
import SegmentationResult from "./models/SegmentationResult.js"
import mongoose from "mongoose"
import dotenv from "dotenv"

dotenv.config()

async function testHeightEstimation() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI)
    console.log("Connected to MongoDB")

    // Check all height estimation results
    const results = await SegmentationResult.find({
      "metadata.analysisType": "building_height"
    }).sort({ createdAt: -1 }).limit(10)

    console.log(`Found ${results.length} height estimation results:`)
    
    for (const result of results) {
      console.log(`\nProcessing ID: ${result.processingId}`)
      console.log(`Status: ${result.status}`)
      console.log(`Created: ${result.createdAt}`)
      console.log(`Buildings found: ${result.detections?.length || 0}`)
      if (result.summary) {
        console.log(`Summary: ${JSON.stringify(result.summary, null, 2)}`)
      }
      if (result.metadata?.error) {
        console.log(`Error: ${result.metadata.error}`)
      }
    }

    process.exit(0)
  } catch (error) {
    console.error("Error:", error)
    process.exit(1)
  }
}

testHeightEstimation()
