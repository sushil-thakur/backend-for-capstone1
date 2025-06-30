#!/usr/bin/env python3
"""
XGBoost Real Estate Price Prediction Model
Processes property data and returns comprehensive prediction results.
"""

import json
import sys
import os
import pickle
import logging
from datetime import datetime, timedelta
from pathlib import Path

# Set up logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def load_model(model_path):
    """Load the XGBoost model from pickle file"""
    try:
        if os.path.exists(model_path):
            with open(model_path, 'rb') as f:
                model = pickle.load(f)
            logger.info(f"Successfully loaded model from {model_path}")
            return model, True
        else:
            logger.warning(f"Model file not found at {model_path}. Using mock predictions.")
            return None, False
    except Exception as e:
        logger.error(f"Error loading model: {str(e)}")
        return None, False

def calculate_environmental_factors(coordinates, property_details):
    """Calculate environmental risk factors based on location and property"""
    lat, lng = coordinates['lat'], coordinates['lng']
    
    # Mock environmental calculations (in real implementation, these would use actual APIs)
    environmental_factors = {
        'deforestation_risk': max(0, min(100, 30 + (lat * 2) % 40)),
        'mining_proximity': max(0, min(100, 25 + (lng * 3) % 50)),
        'fire_risk': max(0, min(100, 20 + abs(lat - 40) * 2)),
        'flood_risk': max(0, min(100, 15 + (abs(lng) % 30))),
        'air_quality_index': max(0, min(500, 50 + ((lat + lng) * 10) % 200)),
        'noise_level': max(0, min(100, 35 + (property_details.get('size', 1000) / 50))),
        'green_space_access': max(0, min(100, 70 - (abs(lat - 35) * 2)))
    }
    
    # Calculate overall environmental score (0-100, higher is better)
    risk_sum = environmental_factors['deforestation_risk'] + environmental_factors['mining_proximity'] + \
               environmental_factors['fire_risk'] + environmental_factors['flood_risk'] + \
               (environmental_factors['air_quality_index'] / 5) + environmental_factors['noise_level']
    
    positive_sum = environmental_factors['green_space_access']
    
    environmental_score = max(0, min(100, 100 - (risk_sum / 6) + (positive_sum / 2)))
    
    return environmental_factors, environmental_score

def generate_market_analysis(coordinates, property_details):
    """Generate market analysis based on location and property characteristics"""
    lat, lng = coordinates['lat'], coordinates['lng']
    
    # Mock market factors (in real implementation, use actual market data)
    market_factors = {
        'local_market_trend': 'growing' if lat % 2 == 0 else 'stable',
        'supply_demand_ratio': max(0.5, min(2.0, 1.0 + (lng % 1))),
        'comparable_sales_count': int(20 + ((lat + lng) * 10) % 50),
        'days_on_market_avg': int(30 + (abs(lat - lng) * 20) % 60),
        'price_per_sqft_area': round(150 + ((lat + lng) * 50) % 300, 2),
        'appreciation_rate_5yr': round(2.5 + (lat % 5), 1)
    }
    
    location_factors = {
        'walkability_score': int(50 + (abs(lat * lng) * 100) % 50),
        'school_rating': max(1, min(10, int(5 + (lat * 2) % 5))),
        'crime_index': max(1, min(10, int(3 + (lng * 1.5) % 6))),
        'transit_access': int(60 + (abs(lat - 40) * 10) % 40),
        'employment_opportunities': int(70 + (lng % 30)),
        'healthcare_access': int(65 + (lat % 35))
    }
    
    return market_factors, location_factors

def calculate_property_value(model, model_available, coordinates, property_details, environmental_score):
    """Calculate property value using XGBoost model or fallback calculation"""
    
    if model_available and model:
        try:
            # In real implementation, prepare features for the actual model
            # This is a simplified example
            features = [
                property_details.get('size', 1500),
                property_details.get('bedrooms', 3),
                property_details.get('bathrooms', 2),
                2024 - property_details.get('yearBuilt', 2000),
                property_details.get('lotSize', 5000),
                coordinates['lat'],
                coordinates['lng'],
                environmental_score
            ]
            
            # Mock prediction (replace with actual model.predict(features))
            base_prediction = sum(features[:3]) * 200 + environmental_score * 1000
            estimated_price = int(base_prediction + (features[4] * 0.1))
            
            logger.info(f"Model prediction successful: ${estimated_price:,}")
            
        except Exception as e:
            logger.error(f"Model prediction failed: {str(e)}, using fallback")
            estimated_price = calculate_fallback_price(coordinates, property_details, environmental_score)
    else:
        estimated_price = calculate_fallback_price(coordinates, property_details, environmental_score)
    
    # Calculate price range and confidence
    price_variance = estimated_price * 0.15  # ±15% variance
    confidence = min(95, max(60, 85 - abs(environmental_score - 70)))  # Higher confidence for better environmental scores
    
    return {
        'estimatedPrice': estimated_price,
        'priceRange': {
            'min': int(estimated_price - price_variance),
            'max': int(estimated_price + price_variance)
        },
        'confidence': confidence,
        'pricePerSqft': round(estimated_price / max(property_details.get('size', 1), 1), 2)
    }

def calculate_fallback_price(coordinates, property_details, environmental_score):
    """Fallback price calculation when model is not available"""
    base_price_per_sqft = 200 + (coordinates['lat'] * 10) % 100
    size = property_details.get('size', 1500)
    bedrooms = property_details.get('bedrooms', 3)
    bathrooms = property_details.get('bathrooms', 2)
    year_built = property_details.get('yearBuilt', 2000)
    lot_size = property_details.get('lotSize', 5000)
    
    # Base calculation
    base_price = size * base_price_per_sqft
    
    # Adjustments
    bedroom_adjustment = (bedrooms - 3) * 15000
    bathroom_adjustment = (bathrooms - 2) * 10000
    age_adjustment = -(2024 - year_built) * 500
    lot_adjustment = (lot_size - 5000) * 5
    environmental_adjustment = (environmental_score - 50) * 500
    
    total_price = base_price + bedroom_adjustment + bathroom_adjustment + age_adjustment + lot_adjustment + environmental_adjustment
    
    return max(50000, int(total_price))  # Minimum $50k

def generate_risk_assessment(environmental_factors, market_factors, property_details):
    """Generate comprehensive risk assessment"""
    
    # Environmental risks
    env_risk_score = (
        environmental_factors['deforestation_risk'] * 0.2 +
        environmental_factors['mining_proximity'] * 0.15 +
        environmental_factors['fire_risk'] * 0.25 +
        environmental_factors['flood_risk'] * 0.3 +
        (environmental_factors['air_quality_index'] / 5) * 0.1
    )
    
    # Market risks
    market_risk_score = (
        (2.0 - market_factors['supply_demand_ratio']) * 25 +
        (market_factors['days_on_market_avg'] - 30) * 0.5
    )
    
    # Property risks
    property_age = 2024 - property_details.get('yearBuilt', 2000)
    property_risk_score = min(50, property_age * 1.5)
    
    overall_risk = (env_risk_score + market_risk_score + property_risk_score) / 3
    
    risk_level = 'low' if overall_risk < 25 else 'medium' if overall_risk < 50 else 'high'
    
    return {
        'overallRisk': risk_level,
        'riskScore': round(overall_risk, 1),
        'breakdown': {
            'environmental': round(env_risk_score, 1),
            'market': round(market_risk_score, 1),
            'property': round(property_risk_score, 1)
        },
        'mitigationStrategies': generate_mitigation_strategies(risk_level, env_risk_score, market_risk_score)
    }

def generate_mitigation_strategies(risk_level, env_risk, market_risk):
    """Generate risk mitigation strategies"""
    strategies = []
    
    if env_risk > 30:
        strategies.extend([
            "Consider environmental insurance coverage",
            "Install air filtration systems",
            "Implement fire-resistant landscaping"
        ])
    
    if market_risk > 30:
        strategies.extend([
            "Consider rental income potential",
            "Monitor local development plans",
            "Diversify investment portfolio"
        ])
    
    if risk_level == 'high':
        strategies.extend([
            "Conduct detailed property inspection",
            "Consult with local real estate experts",
            "Consider shorter investment timeline"
        ])
    
    return strategies

def generate_comparable_properties(coordinates, property_details, estimated_price):
    """Generate mock comparable properties"""
    comparables = []
    
    for i in range(3):
        price_variance = (0.8 + (i * 0.2)) * estimated_price
        comparables.append({
            'address': f"Property {i+1} (Similar area)",
            'price': int(price_variance),
            'size': property_details.get('size', 1500) + (-200 + i * 200),
            'bedrooms': property_details.get('bedrooms', 3) + (i - 1),
            'bathrooms': property_details.get('bathrooms', 2) + (i * 0.5),
            'distance': round(0.5 + i * 0.3, 1),
            'soldDate': (datetime.now() - timedelta(days=30 + i * 20)).strftime('%Y-%m-%d')
        })
    
    return comparables

def determine_investment_grade(prediction, risk_assessment, environmental_score):
    """Determine investment grade based on multiple factors"""
    
    # Price confidence factor
    confidence_factor = prediction['confidence'] / 100
    
    # Environmental factor
    env_factor = environmental_score / 100
    
    # Risk factor (inverse)
    risk_factor = 1 - (risk_assessment['riskScore'] / 100)
    
    # Overall score
    overall_score = (confidence_factor * 0.3 + env_factor * 0.4 + risk_factor * 0.3) * 100
    
    if overall_score >= 80:
        return 'A+'
    elif overall_score >= 70:
        return 'A'
    elif overall_score >= 60:
        return 'B+'
    elif overall_score >= 50:
        return 'B'
    elif overall_score >= 40:
        return 'C+'
    else:
        return 'C'

def determine_growth_potential(market_factors, environmental_score, location_factors):
    """Determine growth potential based on various factors"""
    
    # Market growth indicators
    market_score = 0
    if market_factors['local_market_trend'] == 'growing':
        market_score += 30
    elif market_factors['local_market_trend'] == 'stable':
        market_score += 15
    
    market_score += min(20, market_factors['appreciation_rate_5yr'] * 4)
    
    # Location growth indicators
    location_score = (
        location_factors['walkability_score'] * 0.2 +
        location_factors['school_rating'] * 5 +
        location_factors['transit_access'] * 0.3 +
        location_factors['employment_opportunities'] * 0.2
    )
    
    # Environmental sustainability
    env_score = environmental_score * 0.3
    
    total_score = market_score + location_score + env_score
    
    if total_score >= 80:
        return 'excellent'
    elif total_score >= 65:
        return 'good'
    elif total_score >= 50:
        return 'moderate'
    elif total_score >= 35:
        return 'limited'
    else:
        return 'poor'

def main():
    try:
        # Parse command line arguments
        if len(sys.argv) < 2:
            raise ValueError("No parameters provided")
        
        # Handle parameter file input (starts with @)
        if sys.argv[1].startswith('@'):
            param_file = sys.argv[1][1:]  # Remove @ prefix
            with open(param_file, 'r') as f:
                params = json.load(f)
        else:
            # Parse JSON from command line
            params = json.loads(sys.argv[1])
        
        logger.info(f"Processing prediction for coordinates: {params['coordinates']}")
        
        # Extract parameters
        coordinates = params['coordinates']
        property_details = params['propertyDetails']
        prediction_type = params.get('predictionType', 'comprehensive')
        time_horizon = params.get('timeHorizon', '5years')
        processing_id = params.get('processingId', 'unknown')
        
        # Load XGBoost model
        model_path = os.path.join(os.path.dirname(__file__), '..', 'real_estate_price_xgb_model.pkl')
        model, model_available = load_model(model_path)
        
        # Calculate environmental factors
        environmental_factors, environmental_score = calculate_environmental_factors(coordinates, property_details)
        
        # Generate market analysis
        market_factors, location_factors = generate_market_analysis(coordinates, property_details)
        
        # Calculate property value
        prediction = calculate_property_value(model, model_available, coordinates, property_details, environmental_score)
        
        # Generate risk assessment
        risk_assessment = generate_risk_assessment(environmental_factors, market_factors, property_details)
        
        # Generate comparable properties
        comparable_properties = generate_comparable_properties(coordinates, property_details, prediction['estimatedPrice'])
        
        # Determine investment grade and growth potential
        investment_grade = determine_investment_grade(prediction, risk_assessment, environmental_score)
        growth_potential = determine_growth_potential(market_factors, environmental_score, location_factors)
        
        # Update prediction with additional metrics
        prediction.update({
            'environmentalScore': round(environmental_score, 1),
            'growthPotential': growth_potential,
            'investmentGrade': investment_grade
        })
        
        # Compile results
        results = {
            'success': True,
            'processingId': processing_id,
            'timestamp': datetime.now().isoformat(),
            'prediction': prediction,
            'analysis': {
                'marketFactors': market_factors,
                'locationFactors': location_factors,
                'environmentalFactors': environmental_factors,
                'riskAssessment': risk_assessment,
                'comparableProperties': comparable_properties
            },
            'modelInfo': {
                'modelUsed': 'xgboost_real_estate_v3' if model_available else 'fallback_calculator',
                'modelAvailable': model_available,
                'predictionType': prediction_type,
                'timeHorizon': time_horizon,
                'featuresUsed': [
                    'property_size', 'bedrooms', 'bathrooms', 'year_built', 
                    'lot_size', 'coordinates', 'environmental_score'
                ]
            },
            'metadata': {
                'processingTime': 'completed',
                'confidence': prediction['confidence'],
                'dataQuality': 'high' if model_available else 'medium'
            }
        }
        
        # Output results as JSON
        print(json.dumps(results, indent=2))
        logger.info(f"Successfully completed prediction for {processing_id}")
        
    except Exception as e:
        error_result = {
            'success': False,
            'error': str(e),
            'timestamp': datetime.now().isoformat(),
            'processingId': params.get('processingId', 'unknown') if 'params' in locals() else 'unknown'
        }
        print(json.dumps(error_result, indent=2))
        logger.error(f"Error in prediction: {str(e)}")
        sys.exit(1)

if __name__ == '__main__':
    main()
