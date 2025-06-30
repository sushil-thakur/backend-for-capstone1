#!/usr/bin/env python3
"""
Enhanced Satellite Area Processing Script
Processes geographic areas using satellite data for environmental monitoring
"""

import json
import sys
import numpy as np
import random
from datetime import datetime, timedelta
import math

def calculate_area_km2(bounds):
    """Calculate area in km² from bounds"""
    min_lat, min_lng, max_lat, max_lng = bounds
    
    # Approximate calculation using Haversine formula
    R = 6371  # Earth's radius in km
    avg_lat = (min_lat + max_lat) / 2
    lat_distance = (max_lat - min_lat) * 111.32  # km per degree latitude
    lng_distance = (max_lng - min_lng) * 111.32 * math.cos(math.radians(avg_lat))
    
    return lat_distance * lng_distance

def generate_realistic_detections(bounds, detection_types, area_km2):
    """Generate realistic environmental detections based on area characteristics"""
    detections = []
    min_lat, min_lng, max_lat, max_lng = bounds
    
    # Base detection probability based on area size
    base_detection_rate = min(0.1, area_km2 / 100)  # More detections in larger areas
    
    for detection_type in detection_types:
        # Type-specific detection parameters
        type_params = get_detection_type_params(detection_type)
        num_detections = max(0, int(np.random.poisson(base_detection_rate * type_params['frequency'] * area_km2)))
        
        for _ in range(num_detections):
            # Generate random location within bounds
            lat = random.uniform(min_lat, max_lat)
            lng = random.uniform(min_lng, max_lng)
            
            # Generate detection properties
            detection = create_detection(detection_type, lat, lng, type_params)
            detections.append(detection)
    
    return detections

def get_detection_type_params(detection_type):
    """Get parameters for different detection types"""
    params = {
        'deforestation': {
            'frequency': 0.3,
            'confidence_range': (65, 95),
            'area_range': (0.1, 5.0),
            'severity_weights': {'low': 0.4, 'medium': 0.4, 'high': 0.15, 'critical': 0.05}
        },
        'mining': {
            'frequency': 0.1,
            'confidence_range': (70, 98),
            'area_range': (0.5, 15.0),
            'severity_weights': {'low': 0.2, 'medium': 0.3, 'high': 0.3, 'critical': 0.2}
        },
        'forest_fire': {
            'frequency': 0.05,
            'confidence_range': (80, 99),
            'area_range': (0.2, 50.0),
            'severity_weights': {'low': 0.1, 'medium': 0.2, 'high': 0.4, 'critical': 0.3}
        },
        'agriculture': {
            'frequency': 0.4,
            'confidence_range': (60, 90),
            'area_range': (1.0, 20.0),
            'severity_weights': {'low': 0.6, 'medium': 0.3, 'high': 0.1, 'critical': 0.0}
        },
        'urban_expansion': {
            'frequency': 0.2,
            'confidence_range': (70, 95),
            'area_range': (0.5, 10.0),
            'severity_weights': {'low': 0.5, 'medium': 0.3, 'high': 0.2, 'critical': 0.0}
        },
        'water_body': {
            'frequency': 0.15,
            'confidence_range': (75, 98),
            'area_range': (0.1, 100.0),
            'severity_weights': {'low': 0.8, 'medium': 0.2, 'high': 0.0, 'critical': 0.0}
        }
    }
    
    return params.get(detection_type, params['deforestation'])

def create_detection(detection_type, lat, lng, params):
    """Create a detection object with realistic properties"""
    confidence = random.uniform(*params['confidence_range'])
    area = random.uniform(*params['area_range'])
    
    # Select severity based on weights
    severity_options = list(params['severity_weights'].keys())
    severity_weights = list(params['severity_weights'].values())
    severity = np.random.choice(severity_options, p=severity_weights)
    
    # Generate bounding box (simplified as center point with offset)
    bbox_size = math.sqrt(area) / 111.32  # Convert km to degrees (approximate)
    bbox = [
        lng - bbox_size/2,
        lat - bbox_size/2,
        bbox_size,
        bbox_size
    ]
    
    detection = {
        'class': detection_type,
        'confidence': round(confidence, 2),
        'bbox': bbox,
        'center': [lng, lat],
        'area': round(area, 3),
        'severity': severity
    }
    
    # Add type-specific properties
    if detection_type == 'mining':
        detection.update({
            'mining_type': random.choice(['surface', 'underground', 'quarry']),
            'infrastructure_detected': random.choice([True, False]),
            'aspect_ratio': round(random.uniform(0.5, 3.0), 2),
            'edge_density': round(random.uniform(0.1, 1.0), 2)
        })
    elif detection_type == 'forest_fire':
        detection.update({
            'fire_type': random.choice(['active', 'burned', 'smoke']),
            'active_fire_ratio': round(random.uniform(0.0, 1.0), 2),
            'smoke_ratio': round(random.uniform(0.0, 0.8), 2),
            'burned_ratio': round(random.uniform(0.0, 1.0), 2),
            'heat_signature': round(random.uniform(0.3, 1.0), 2)
        })
    elif detection_type == 'deforestation':
        detection.update({
            'vegetation_loss': round(random.uniform(0.2, 1.0), 2),
            'shape_regularity': round(random.uniform(0.1, 1.0), 2),
            'deforestation_rate': round(random.uniform(0.1, 0.9), 2)
        })
    
    return detection

def simulate_satellite_processing(params):
    """Simulate satellite data processing"""
    bounds = params['bounds']
    detection_types = params['detectionTypes']
    resolution = params.get('resolution', 10)
    
    # Calculate processing time based on area and resolution
    area_km2 = calculate_area_km2(bounds)
    processing_time = max(1.0, area_km2 * 0.5 + random.uniform(0.5, 2.0))
    
    # Generate detections
    detections = generate_realistic_detections(bounds, detection_types, area_km2)
    
    # Calculate overall confidence
    if detections:
        overall_confidence = sum(d['confidence'] for d in detections) / len(detections)
    else:
        overall_confidence = 85.0  # Default confidence when no detections
    
    # Simulate satellite source selection
    satellite_sources = ['Sentinel-2', 'Landsat-8', 'MODIS', 'Sentinel-1']
    satellite_source = random.choice(satellite_sources)
    
    return {
        'detections': detections,
        'confidence': round(overall_confidence, 2),
        'processingTime': round(processing_time, 2),
        'satelliteSource': satellite_source,
        'metadata': {
            'areaProcessed': round(area_km2, 2),
            'resolution': f"{resolution}m/pixel",
            'processingDate': datetime.now().isoformat(),
            'weatherConditions': {
                'cloudCover': round(random.uniform(0, 30), 1),
                'temperature': round(random.uniform(15, 35), 1),
                'humidity': round(random.uniform(40, 80), 1)
            },
            'qualityMetrics': {
                'imageQuality': round(random.uniform(0.7, 1.0), 2),
                'processingAccuracy': round(random.uniform(0.8, 0.98), 2),
                'dataCompleteness': round(random.uniform(0.85, 1.0), 2)
            }
        }
    }

def main():
    try:
        # Read parameters from command line
        if len(sys.argv) < 2:
            raise ValueError("Parameters required")
        
        params_json = sys.argv[1]
        params = json.loads(params_json)
        
        # Validate required parameters
        required_params = ['bounds', 'detectionTypes']
        for param in required_params:
            if param not in params:
                raise ValueError(f"Missing required parameter: {param}")
        
        # Validate bounds
        bounds = params['bounds']
        if len(bounds) != 4:
            raise ValueError("Bounds must contain 4 values: [minLat, minLng, maxLat, maxLng]")
        
        min_lat, min_lng, max_lat, max_lng = bounds
        if min_lat >= max_lat or min_lng >= max_lng:
            raise ValueError("Invalid bounds: min values must be less than max values")
        
        # Process the satellite area
        result = simulate_satellite_processing(params)
        
        # Output result as JSON
        print(json.dumps(result, indent=2))
        
    except Exception as e:
        error_result = {
            'error': str(e),
            'detections': [],
            'confidence': 0,
            'processingTime': 0,
            'satelliteSource': 'error'
        }
        print(json.dumps(error_result, indent=2))
        sys.exit(1)

if __name__ == "__main__":
    main()
