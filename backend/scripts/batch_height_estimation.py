#!/usr/bin/env python3
"""
Batch Building Height Estimation Script for Environmental Monitoring Platform
Processes multiple buildings for height estimation in batch mode
"""

import json
import sys
import os
import numpy as np
from datetime import datetime
import traceback

def main():
    try:
        # Get input parameters from command line
        if len(sys.argv) < 2:
            raise ValueError("Missing input parameters")
        
        # Check if parameter is a file reference (starts with @)
        param_input = sys.argv[1]
        if param_input.startswith('@'):
            # Read from file
            file_path = param_input[1:]
            with open(file_path, 'r') as f:
                params = json.load(f)
        else:
            # Parse as JSON string
            params = json.loads(param_input)
        
        batch_id = params['batchId']
        buildings = params['buildings']
        user_id = params.get('userId', 'anonymous')
        output_dir = params.get('outputDir', './uploads/results')
        
        # Ensure output directory exists
        os.makedirs(output_dir, exist_ok=True)
        
        # Process batch height estimation
        results = process_batch_height_estimation(batch_id, buildings, user_id, output_dir)
        
        # Output results as JSON to stdout
        print(json.dumps(results))
        
    except Exception as e:
        # Output error to stderr
        error_info = {
            "error": str(e),
            "traceback": traceback.format_exc(),
            "timestamp": datetime.now().isoformat()
        }
        print(json.dumps(error_info), file=sys.stderr)
        sys.exit(1)

def process_batch_height_estimation(batch_id, buildings, user_id, output_dir):
    """
    Process multiple buildings for height estimation in batch mode
    """
    
    processed_buildings = []
    failed_buildings = []
    
    for building in buildings:
        try:
            building_result = estimate_single_building_height(building, batch_id)
            processed_buildings.append(building_result)
        except Exception as e:
            failed_buildings.append({
                "buildingId": building.get('id', 'unknown'),
                "coordinates": {
                    "lat": building.get('lat'),
                    "lng": building.get('lng')
                },
                "error": str(e),
                "status": "failed"
            })
    
    # Calculate batch statistics
    if processed_buildings:
        heights = [b['estimatedHeight'] for b in processed_buildings]
        confidences = [b['confidence'] for b in processed_buildings]
        
        batch_stats = {
            "totalProcessed": len(processed_buildings),
            "totalFailed": len(failed_buildings),
            "averageHeight": round(np.mean(heights), 2) if heights else 0,
            "maxHeight": round(np.max(heights), 2) if heights else 0,
            "minHeight": round(np.min(heights), 2) if heights else 0,
            "heightStdDev": round(np.std(heights), 2) if heights else 0,
            "averageConfidence": round(np.mean(confidences), 3) if confidences else 0,
            "successRate": round(len(processed_buildings) / len(buildings) * 100, 1) if buildings else 0
        }
    else:
        batch_stats = {
            "totalProcessed": 0,
            "totalFailed": len(failed_buildings),
            "averageHeight": 0,
            "maxHeight": 0,
            "minHeight": 0,
            "heightStdDev": 0,
            "averageConfidence": 0,
            "successRate": 0
        }
    
    return {
        "success": True,
        "batchId": batch_id,
        "userId": user_id,
        "processedBuildings": processed_buildings,
        "failedBuildings": failed_buildings,
        "statistics": batch_stats,
        "metadata": {
            "processingTime": round(np.random.uniform(30, 120), 1),  # Simulated processing time
            "algorithm": "batch_height_estimation_v1.0",
            "timestamp": datetime.now().isoformat(),
            "totalInputBuildings": len(buildings)
        }
    }

def estimate_single_building_height(building, batch_id):
    """
    Estimate height for a single building
    """
    lat = building.get('lat')
    lng = building.get('lng')
    building_id = building.get('id', f"batch_{batch_id}_building_{np.random.randint(1000, 9999)}")
    
    if lat is None or lng is None:
        raise ValueError("Building coordinates (lat, lng) are required")
    
    # Simulate height estimation based on location and random factors
    # In production, this would use real DEM data and satellite imagery
    
    # Base height simulation based on latitude (urban density proxy)
    urban_factor = abs(lat) * 2  # Simple urban density simulation
    base_height = np.random.uniform(3, 40) * (1 + urban_factor * 0.1)
    
    # Add some realistic variation
    height_variation = np.random.normal(0, base_height * 0.2)
    estimated_height = max(0, base_height + height_variation)
    
    # Simulate confidence based on various factors
    base_confidence = 0.75
    location_confidence = min(0.95, max(0.6, 0.85 - abs(lat) * 0.01))  # Better accuracy near equator
    height_confidence = max(0.7, min(0.95, 0.9 - (estimated_height / 200)))  # Lower confidence for very tall buildings
    
    confidence = base_confidence * location_confidence * height_confidence * np.random.uniform(0.9, 1.1)
    confidence = max(0.6, min(0.95, confidence))
    
    # Categorize building
    if estimated_height < 12:
        category = "low_rise"
    elif estimated_height < 35:
        category = "mid_rise"
    elif estimated_height < 100:
        category = "high_rise"
    else:
        category = "skyscraper"
    
    return {
        "buildingId": building_id,
        "coordinates": {
            "lat": round(lat, 6),
            "lng": round(lng, 6)
        },
        "estimatedHeight": round(estimated_height, 2),
        "confidence": round(confidence, 3),
        "category": category,
        "floorEstimate": max(1, int(estimated_height / 3.5)),  # Assume 3.5m per floor
        "detectionMethod": "batch_DEM_analysis",
        "metadata": {
            "processingMode": "batch",
            "batchId": batch_id,
            "demResolution": "30m",
            "roofType": np.random.choice(["flat", "pitched", "complex"]),
            "buildingAge": "estimated_modern" if estimated_height > 20 else "estimated_mixed"
        }
    }

if __name__ == "__main__":
    main()
