// test-db.js - Test database connectivity and SegmentationResult model
import SegmentationResult from "./models/SegmentationResult.js"
import mongoose from "mongoose"
import dotenv from "dotenv"

dotenv.config()

async function testDatabase() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI)
    console.log("Connected to MongoDB")

    // Create a valid ObjectId for testing
    const testUserId = new mongoose.Types.ObjectId("000000000000000000000000")

    // Test creating a SegmentationResult
    const testResult = new SegmentationResult({
      userId: testUserId,
      processingId: "test_height_123",
      modelUsed: "building_height_estimation_v1",
      inputType: "geographic_bounds",
      confidence: 85,
      coordinates: {
        bounds: {
          minLat: -3.259,
          maxLat: -3.241,
          minLng: -64.259,
          maxLng: -64.241
        },
        center: {
          lat: -3.25,
          lng: -64.25
        }
      },
      zoneName: "Test Height Analysis",
      status: "processing",
      analysisType: "geographic_area",
      environmentalRisk: "Low",
      metadata: {
        analysisType: "building_height",
        resolution: 30,
        areaSize: "0.0324",
        processingStarted: new Date()
      }
    })

    const saved = await testResult.save()
    console.log("Test result saved successfully:")
    console.log(`ID: ${saved._id}`)
    console.log(`Processing ID: ${saved.processingId}`)
    console.log(`Status: ${saved.status}`)

    // Query back all results
    const allResults = await SegmentationResult.find({})
    console.log(`\nTotal SegmentationResults in database: ${allResults.length}`)

    for (const result of allResults) {
      console.log(`- ${result.processingId}: ${result.status} (${result.metadata?.analysisType || 'unknown type'})`)
    }

    // Clean up test result
    await SegmentationResult.deleteOne({ processingId: "test_height_123" })
    console.log("\nTest result cleaned up")

    process.exit(0)
  } catch (error) {
    console.error("Error:", error)
    process.exit(1)
  }
}

testDatabase()
