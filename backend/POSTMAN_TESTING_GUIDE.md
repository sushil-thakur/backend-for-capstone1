# NASA DEM Height Estimation API - Postman Collection

This comprehensive Postman collection tests the building height estimation API that uses NASA DEM (SRTM/ASTER) data for elevation analysis.

## How to Import and Use

### 1. Import the Collection
1. Open Postman
2. Click "Import" 
3. Select `NASA_DEM_Height_Estimation_API.postman_collection.json`
4. The collection will appear in your Postman workspace

### 2. Set Up Environment Variables
The collection uses these variables (already configured):
- `base_url`: http://localhost:8000 (API server URL)
- `processing_id`: Auto-populated from responses
- `user_id`: Sample MongoDB user ID

### 3. Collection Structure

#### 🏗️ Height Estimation
- **Estimate Heights - Point with Radius**: Submit estimation for a lat/lng point with radius
- **Estimate Heights - Bounding Box**: Submit estimation using explicit bounding box
- **Estimate Heights - Anonymous User**: Test without providing user ID
- **Batch Height Estimation**: Process multiple building locations at once

#### 📊 Results Retrieval
- **Get Height Results**: Check status and retrieve results using processing ID
- **Get Height Results - Manual ID**: Test with specific processing ID

#### 📈 Statistics
- **Get Height Statistics**: Get area statistics for different time periods

#### ❌ Error Testing
- **Invalid Coordinates**: Test validation with invalid lat/lng
- **Missing Coordinates**: Test without required coordinates
- **Area Too Large**: Test size limits (max 100 km²)
- **Invalid Processing ID**: Test error handling

#### 🔄 Complete Workflow
- **1. Submit Height Estimation**: Start estimation and capture processing ID
- **2. Wait 15 seconds**: Allow processing to complete (10-30 second typical)
- **3. Check Final Results**: Verify completion and view results

## Quick Start Testing

### Basic Test
1. Start your API server: `npm start` or `node server.js`
2. Run "Estimate Heights - Point with Radius"
3. Copy the `processingId` from response
4. Wait 15-30 seconds
5. Run "Get Height Results" to see completed analysis

### Full Workflow Test
1. Run the entire "Complete Workflow" folder in sequence
2. Each step builds on the previous one
3. Results include NASA DEM source confirmation and building height data

## API Response Format

### Successful Batch Estimation Request
```json
{
  "message": "Batch height estimation started",
  "batchId": "batch_height_1751234567890_abc123def",
  "totalBuildings": 4,
  "chunks": 1,
  "estimatedTime": "1 seconds",
  "results": [
    {
      "processingId": "batch_height_1751234567890_abc123def_chunk_0",
      "buildingCount": 4,
      "status": "queued"
    }
  ]
}
```

### Successful Estimation Request
```json
{
  "message": "Height estimation started",
  "processingId": "height_1751234567890_abc123def",
  "estimatedTime": "10-30 seconds",
  "areaSize": 3.14,
  "demSource": "NASA SRTM/ASTER"
}
```

### Completed Results
```json
{
  "processingId": "height_1751234567890_abc123def",
  "status": "completed",
  "results": [
    {
      "buildingId": "bld_001",
      "coordinates": { "lat": -3.25, "lng": -64.25 },
      "estimatedHeight": 12.5,
      "confidence": 0.87,
      "class": "urban_expansion"
    }
  ],
  "metadata": {
    "demSource": "NASA SRTM 30m",
    "processingTime": 18.3,
    "buildingsAnalyzed": 15,
    "timestamp": "2024-01-15T10:30:00.000Z"
  }
}
```

## Features Tested

✅ **Coordinate Formats**: Point+radius and bounding box
✅ **NASA DEM Integration**: SRTM/ASTER elevation data
✅ **Anonymous Users**: Requests without user ID
✅ **Batch Processing**: Multiple buildings at once
✅ **Error Handling**: Invalid inputs and edge cases
✅ **Processing Status**: Real-time status tracking
✅ **Result Validation**: Schema compliance checking
✅ **Performance**: 10-30 second processing times

## Test Results Validation

The collection automatically validates:
- HTTP status codes (200/202 for success, 400/404 for errors)
- Response structure and required fields
- NASA DEM source confirmation in metadata
- Processing completion status
- Error message content for failed requests

## Troubleshooting

**Server not responding?**
- Check if server is running on port 8000
- Verify MongoDB connection
- Check console logs for errors

**Processing takes too long?**
- Normal processing time is 10-30 seconds
- Large areas may take longer
- Check server logs for Python script execution

**Results not found?**
- Wait longer for processing to complete
- Check `processingId` is correct
- Verify MongoDB is storing results properly

## Real Estate Integration

This height estimation API integrates with the broader real estate prediction system, providing building height data for:
- Property valuation models
- Urban development analysis
- Environmental impact assessment
- Satellite imagery validation
