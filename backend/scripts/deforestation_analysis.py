#!/usr/bin/env python3
"""
Deforestation Analysis Script for Environmental Monitoring Platform
Processes satellite data to detect forest loss and environmental changes
"""

import json
import sys
import os
import numpy as np
from datetime import datetime, timedelta
import traceback

def main():
    try:
        # Get input parameters from command line
        if len(sys.argv) < 2:
            raise ValueError("Missing input parameters")
        
        params = json.loads(sys.argv[1])
        bounds = params['bounds']
        processing_id = params['processingId']
        time_range = params.get('timeRange', '1year')
        output_dir = params.get('outputDir', './uploads/results')
        
        # Ensure output directory exists
        os.makedirs(output_dir, exist_ok=True)
        
        # Simulate deforestation analysis (replace with actual satellite processing)
        results = analyze_deforestation(bounds, time_range, processing_id)
        
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

def analyze_deforestation(bounds, time_range, processing_id):
    """
    Simulate deforestation analysis
    In production, this would integrate with satellite data APIs (Google Earth Engine, Sentinel, etc.)
    """
    
    # Calculate area
    lat_diff = bounds['maxLat'] - bounds['minLat']
    lng_diff = bounds['maxLng'] - bounds['minLng']
    area_km2 = lat_diff * lng_diff * 111 * 111
    
    # Simulate forest loss analysis
    np.random.seed(42)  # For consistent results
    
    # Simulate detection results
    num_detections = max(1, int(area_km2 * 0.1))  # Scale with area
    detections = []
    
    for i in range(num_detections):
        detection = {
            "id": f"detection_{processing_id}_{i}",
            "coordinates": {
                "lat": bounds['minLat'] + (bounds['maxLat'] - bounds['minLat']) * np.random.random(),
                "lng": bounds['minLng'] + (bounds['maxLng'] - bounds['minLng']) * np.random.random()
            },
            "confidence": 0.6 + 0.3 * np.random.random(),  # 60-90% confidence
            "severity": np.random.choice(['low', 'medium', 'high'], p=[0.5, 0.3, 0.2]),
            "affectedAreaHa": 0.5 + 10 * np.random.random(),  # 0.5-10.5 hectares
            "detectedAt": (datetime.now() - timedelta(days=np.random.randint(0, 365))).isoformat(),
            "changeType": "forest_loss",
            "vegetationIndex": {
                "ndvi_before": 0.7 + 0.2 * np.random.random(),
                "ndvi_after": 0.1 + 0.4 * np.random.random(),
                "change": None
            }
        }
        detection["vegetationIndex"]["change"] = (
            detection["vegetationIndex"]["ndvi_after"] - detection["vegetationIndex"]["ndvi_before"]
        )
        detections.append(detection)
    
    # Calculate summary statistics
    total_forest_loss = sum(d["affectedAreaHa"] for d in detections)
    forest_loss_percentage = min(100, (total_forest_loss / (area_km2 * 100)) * 100)  # Convert km2 to hectares
    
    # Determine severity level
    if forest_loss_percentage > 10:
        severity_level = "high"
    elif forest_loss_percentage > 5:
        severity_level = "medium"
    else:
        severity_level = "low"
    
    # Calculate confidence score
    avg_confidence = np.mean([d["confidence"] for d in detections]) if detections else 0
    
    # Create hotspots (areas with high concentration of detections)
    hotspots = generate_hotspots(detections, bounds)
    
    # Generate temporal analysis
    temporal_analysis = generate_temporal_analysis(time_range)
    
    # Generate risk assessment
    risk_assessment = generate_risk_assessment(forest_loss_percentage, severity_level)
    
    return {
        "success": True,
        "processingId": processing_id,
        "detections": detections,
        "summary": {
            "totalForestLoss": round(total_forest_loss, 2),
            "forestLossPercentage": round(forest_loss_percentage, 2),
            "affectedAreas": len(detections),
            "severityLevel": severity_level,
            "confidenceScore": round(avg_confidence, 2),
            "analysisDate": datetime.now().isoformat(),
            "areaAnalyzed": round(area_km2, 2)
        },
        "hotspots": hotspots,
        "temporalAnalysis": temporal_analysis,
        "riskAssessment": risk_assessment,
        "metadata": {
            "analysisMethod": "satellite_change_detection",
            "dataSource": "simulated_satellite_data",
            "timeRange": time_range,
            "bounds": bounds
        }
    }

def generate_hotspots(detections, bounds):
    """Generate forest loss hotspots"""
    if not detections:
        return []
    
    # Group detections into clusters
    hotspots = []
    high_severity_detections = [d for d in detections if d["severity"] == "high"]
    
    if high_severity_detections:
        # Create hotspot from high severity detections
        center_lat = np.mean([d["coordinates"]["lat"] for d in high_severity_detections])
        center_lng = np.mean([d["coordinates"]["lng"] for d in high_severity_detections])
        total_area = sum(d["affectedAreaHa"] for d in high_severity_detections)
        
        hotspots.append({
            "id": "hotspot_1",
            "center": {"lat": center_lat, "lng": center_lng},
            "radius": 1000,  # meters
            "severity": "high",
            "detectionCount": len(high_severity_detections),
            "totalAreaAffected": round(total_area, 2),
            "alertLevel": "critical" if total_area > 20 else "high"
        })
    
    return hotspots

def generate_temporal_analysis(time_range):
    """Generate temporal analysis data"""
    months = {
        "3months": 3,
        "6months": 6,
        "1year": 12,
        "2years": 24
    }.get(time_range, 12)
    
    # Simulate monthly forest loss data
    monthly_data = []
    for i in range(months):
        date = datetime.now() - timedelta(days=30 * i)
        monthly_data.append({
            "month": date.strftime("%Y-%m"),
            "forestLoss": round(np.random.exponential(2), 2),
            "detectionCount": np.random.poisson(3),
            "averageConfidence": round(0.6 + 0.3 * np.random.random(), 2)
        })
    
    # Calculate trend
    recent_avg = np.mean([d["forestLoss"] for d in monthly_data[:3]])
    older_avg = np.mean([d["forestLoss"] for d in monthly_data[-3:]])
    
    trend = "increasing" if recent_avg > older_avg * 1.2 else "decreasing" if recent_avg < older_avg * 0.8 else "stable"
    
    return {
        "monthlyData": monthly_data,
        "trend": trend,
        "trendPercentage": round(((recent_avg - older_avg) / older_avg * 100) if older_avg > 0 else 0, 2),
        "peakMonth": max(monthly_data, key=lambda x: x["forestLoss"])["month"],
        "totalPeriodLoss": round(sum(d["forestLoss"] for d in monthly_data), 2)
    }

def generate_risk_assessment(forest_loss_percentage, severity_level):
    """Generate risk assessment"""
    risk_factors = {
        "deforestation_rate": {
            "value": forest_loss_percentage,
            "risk": "high" if forest_loss_percentage > 5 else "medium" if forest_loss_percentage > 2 else "low",
            "description": f"Current deforestation rate: {forest_loss_percentage:.2f}%"
        },
        "climate_change": {
            "value": np.random.randint(60, 90),
            "risk": "medium",
            "description": "Climate change vulnerability assessment"
        },
        "human_pressure": {
            "value": np.random.randint(40, 80),
            "risk": "medium",
            "description": "Human activity pressure on forest areas"
        },
        "biodiversity_impact": {
            "value": np.random.randint(50, 85),
            "risk": "high" if severity_level == "high" else "medium",
            "description": "Impact on local biodiversity"
        }
    }
    
    # Calculate overall risk score
    overall_score = np.mean([factor["value"] for factor in risk_factors.values()])
    overall_risk = "high" if overall_score > 70 else "medium" if overall_score > 40 else "low"
    
    return {
        "overallRisk": overall_risk,
        "riskScore": round(overall_score, 1),
        "factors": risk_factors,
        "recommendations": generate_recommendations(overall_risk, forest_loss_percentage)
    }

def generate_recommendations(risk_level, loss_percentage):
    """Generate conservation recommendations"""
    recommendations = []
    
    if risk_level == "high":
        recommendations.extend([
            "Immediate conservation intervention required",
            "Deploy monitoring systems in affected areas",
            "Implement strict protection measures",
            "Engage local communities in conservation efforts"
        ])
    elif risk_level == "medium":
        recommendations.extend([
            "Increased monitoring recommended",
            "Develop sustainable management plans",
            "Regular assessment of forest health"
        ])
    else:
        recommendations.extend([
            "Continue routine monitoring",
            "Maintain current conservation practices"
        ])
    
    if loss_percentage > 5:
        recommendations.append("Priority area for reforestation programs")
    
    return recommendations

if __name__ == "__main__":
    main()
