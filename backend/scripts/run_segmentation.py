import sys
import json
import cv2
import numpy as np
import os
from pathlib import Path
from datetime import datetime
import time

try:
    from skimage import segmentation, measure, morphology, filters
    from skimage.color import rgb2gray
    from skimage.feature import canny
    from scipy import ndimage
    import matplotlib.pyplot as plt
    import matplotlib.patches as patches
    DEPENDENCIES_AVAILABLE = True
except ImportError:
    DEPENDENCIES_AVAILABLE = False

class EnvironmentalSegmentation:
    def __init__(self):
        self.model_types = {
            'deforestation': self.detect_deforestation,
            'mining': self.detect_mining,
            'forest_fire': self.detect_forest_fire,
            'agriculture': self.detect_agriculture,
            'urban': self.detect_urban_expansion,
            'water': self.detect_water_bodies,
            'general': self.general_land_segmentation
        }
    
    def process_image(self, image_path, model_type='deforestation'):
        """Main processing function"""
        start_time = time.time()
        
        # Load image
        image = cv2.imread(image_path)
        if image is None:
            raise ValueError(f"Could not load image from {image_path}")
        
        # Convert BGR to RGB
        image_rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        
        # Get image dimensions
        height, width = image.shape[:2]
        image_size = {"width": width, "height": height}
        
        # Apply appropriate segmentation method
        if model_type in self.model_types:
            detections, confidence = self.model_types[model_type](image_rgb)
        else:
            detections, confidence = self.general_land_segmentation(image_rgb)
        
        processing_time = time.time() - start_time
        
        return {
            'detections': detections,
            'confidence': confidence,
            'processing_time': processing_time,
            'image_size': image_size,
            'model_used': f'OpenCV_Enhanced_{model_type}'
        }
    
    def detect_deforestation(self, image):
        """Enhanced deforestation detection"""
        detections = []
        
        # Convert to HSV
        hsv = cv2.cvtColor(image, cv2.COLOR_RGB2HSV)
        
        # Vegetation detection
        lower_green1 = np.array([35, 40, 40])
        upper_green1 = np.array([85, 255, 255])
        vegetation_mask1 = cv2.inRange(hsv, lower_green1, upper_green1)
        
        lower_green2 = np.array([25, 30, 30])
        upper_green2 = np.array([45, 255, 255])
        vegetation_mask2 = cv2.inRange(hsv, lower_green2, upper_green2)
        
        vegetation_mask = cv2.bitwise_or(vegetation_mask1, vegetation_mask2)
        
        # Detect cleared areas
        lower_brown = np.array([8, 50, 20])
        upper_brown = np.array([25, 255, 200])
        bare_soil_mask = cv2.inRange(hsv, lower_brown, upper_brown)
        
        lower_cleared = np.array([15, 30, 100])
        upper_cleared = np.array([30, 150, 255])
        cleared_mask = cv2.inRange(hsv, lower_cleared, upper_cleared)
        
        deforestation_mask = cv2.bitwise_or(bare_soil_mask, cleared_mask)
        
        # Morphological operations
        kernel = np.ones((5,5), np.uint8)
        deforestation_mask = cv2.morphologyEx(deforestation_mask, cv2.MORPH_CLOSE, kernel)
        deforestation_mask = cv2.morphologyEx(deforestation_mask, cv2.MORPH_OPEN, kernel)
        
        # Find contours
        contours, _ = cv2.findContours(deforestation_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        for contour in contours:
            area = cv2.contourArea(contour)
            if area > 1000:
                x, y, w, h = cv2.boundingRect(contour)
                
                # Calculate confidence
                roi = deforestation_mask[y:y+h, x:x+w]
                coverage = np.sum(roi > 0) / (w * h) * 100
                
                veg_roi = vegetation_mask[y:y+h, x:x+w]
                vegetation_loss = 100 - (np.sum(veg_roi > 0) / (w * h) * 100)
                
                confidence = (coverage * 0.4 + vegetation_loss * 0.4) + 20
                confidence = min(95, max(30, confidence))
                
                # Determine severity
                if area > 10000 and vegetation_loss > 70:
                    severity = "critical"
                elif area > 5000 and vegetation_loss > 50:
                    severity = "high"
                elif vegetation_loss > 30:
                    severity = "medium"
                else:
                    severity = "low"
                
                if confidence > 35:
                    detections.append({
                        'class': 'deforestation',
                        'confidence': round(confidence, 2),
                        'bbox': [int(x), int(y), int(w), int(h)],
                        'area': int(area),
                        'center': [int(x + w/2), int(y + h/2)],
                        'severity': severity,
                        'vegetation_loss': round(vegetation_loss, 2)
                    })
        
        overall_confidence = min(90, len(detections) * 15 + 45) if detections else 25
        return detections, overall_confidence
    
    def detect_mining(self, image):
        """NEW: Mining detection"""
        detections = []
        
        # Convert to multiple color spaces
        hsv = cv2.cvtColor(image, cv2.COLOR_RGB2HSV)
        gray = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY)
        
        # Detect exposed rock and mineral surfaces
        lower_rock = np.array([0, 0, 80])
        upper_rock = np.array([30, 80, 255])
        rock_mask = cv2.inRange(hsv, lower_rock, upper_rock)
        
        # Detect mining equipment (metallic surfaces)
        lower_metal = np.array([0, 0, 150])
        upper_metal = np.array([180, 50, 255])
        metal_mask = cv2.inRange(hsv, lower_metal, upper_metal)
        
        # Detect disturbed earth
        lower_disturbed = np.array([5, 100, 50])
        upper_disturbed = np.array([20, 255, 200])
        disturbed_mask = cv2.inRange(hsv, lower_disturbed, upper_disturbed)
        
        # Combine mining indicators
        mining_mask = cv2.bitwise_or(rock_mask, metal_mask)
        mining_mask = cv2.bitwise_or(mining_mask, disturbed_mask)
        
        # Edge detection for geometric patterns
        edges = cv2.Canny(gray, 50, 150)
        
        # Morphological operations
        kernel = np.ones((7,7), np.uint8)
        mining_mask = cv2.morphologyEx(mining_mask, cv2.MORPH_CLOSE, kernel)
        
        # Find contours
        contours, _ = cv2.findContours(mining_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        for contour in contours:
            area = cv2.contourArea(contour)
            if area > 2000:
                x, y, w, h = cv2.boundingRect(contour)
                
                # Analyze patterns
                aspect_ratio = w / h
                extent = area / (w * h)
                
                roi_edges = edges[y:y+h, x:x+w]
                edge_density = np.sum(roi_edges > 0) / (w * h)
                
                confidence = 50
                
                if 0.3 < aspect_ratio < 3.0:
                    confidence += 15
                if extent > 0.5:
                    confidence += 10
                if edge_density > 0.1:
                    confidence += 15
                
                # Determine severity
                if area > 50000 and edge_density > 0.15:
                    severity = "critical"
                elif area > 20000:
                    severity = "high"
                elif area > 10000:
                    severity = "medium"
                else:
                    severity = "low"
                
                confidence = min(95, confidence)
                
                if confidence > 60:
                    detections.append({
                        'class': 'mining',
                        'confidence': round(confidence, 2),
                        'bbox': [int(x), int(y), int(w), int(h)],
                        'area': int(area),
                        'center': [int(x + w/2), int(y + h/2)],
                        'severity': severity,
                        'aspect_ratio': round(aspect_ratio, 2),
                        'edge_density': round(edge_density, 3)
                    })
        
        overall_confidence = min(85, len(detections) * 20 + 40) if detections else 30
        return detections, overall_confidence
    
    def detect_forest_fire(self, image):
        """NEW: Forest fire detection"""
        detections = []
        
        # Convert to HSV
        hsv = cv2.cvtColor(image, cv2.COLOR_RGB2HSV)
        
        # Detect active fires (red/orange/yellow)
        lower_fire1 = np.array([0, 100, 100])
        upper_fire1 = np.array([10, 255, 255])
        fire_mask1 = cv2.inRange(hsv, lower_fire1, upper_fire1)
        
        lower_fire2 = np.array([170, 100, 100])
        upper_fire2 = np.array([180, 255, 255])
        fire_mask2 = cv2.inRange(hsv, lower_fire2, upper_fire2)
        
        # Detect flames (yellow/orange)
        lower_flame = np.array([15, 150, 150])
        upper_flame = np.array([35, 255, 255])
        flame_mask = cv2.inRange(hsv, lower_flame, upper_flame)
        
        active_fire_mask = cv2.bitwise_or(fire_mask1, fire_mask2)
        active_fire_mask = cv2.bitwise_or(active_fire_mask, flame_mask)
        
        # Detect smoke
        lower_smoke = np.array([0, 0, 100])
        upper_smoke = np.array([180, 30, 200])
        smoke_mask = cv2.inRange(hsv, lower_smoke, upper_smoke)
        
        # Detect burned areas
        lower_burned = np.array([0, 0, 0])
        upper_burned = np.array([180, 255, 80])
        burned_mask = cv2.inRange(hsv, lower_burned, upper_burned)
        
        # Combine fire indicators
        fire_indicators = cv2.bitwise_or(active_fire_mask, smoke_mask)
        fire_indicators = cv2.bitwise_or(fire_indicators, burned_mask)
        
        # Find contours
        contours, _ = cv2.findContours(fire_indicators, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        for contour in contours:
            area = cv2.contourArea(contour)
            if area > 500:
                x, y, w, h = cv2.boundingRect(contour)
                
                # Analyze fire characteristics
                roi_active = active_fire_mask[y:y+h, x:x+w]
                roi_smoke = smoke_mask[y:y+h, x:x+w]
                roi_burned = burned_mask[y:y+h, x:x+w]
                
                active_fire_ratio = np.sum(roi_active > 0) / (w * h)
                smoke_ratio = np.sum(roi_smoke > 0) / (w * h)
                burned_ratio = np.sum(roi_burned > 0) / (w * h)
                
                confidence = 40
                
                if active_fire_ratio > 0.1:
                    confidence += 30
                    fire_type = "active_fire"
                elif smoke_ratio > 0.3:
                    confidence += 25
                    fire_type = "smoke"
                elif burned_ratio > 0.5:
                    confidence += 20
                    fire_type = "burned_area"
                else:
                    fire_type = "fire_risk"
                
                # Determine severity
                total_indicators = active_fire_ratio + smoke_ratio + (burned_ratio * 0.5)
                if total_indicators > 0.7 or area > 20000:
                    severity = "critical"
                elif total_indicators > 0.4 or area > 10000:
                    severity = "high"
                elif total_indicators > 0.2:
                    severity = "medium"
                else:
                    severity = "low"
                
                confidence = min(95, confidence)
                
                if confidence > 50:
                    detections.append({
                        'class': 'forest_fire',
                        'confidence': round(confidence, 2),
                        'bbox': [int(x), int(y), int(w), int(h)],
                        'area': int(area),
                        'center': [int(x + w/2), int(y + h/2)],
                        'severity': severity,
                        'fire_type': fire_type,
                        'active_fire_ratio': round(active_fire_ratio, 3),
                        'smoke_ratio': round(smoke_ratio, 3),
                        'burned_ratio': round(burned_ratio, 3)
                    })
        
        overall_confidence = min(90, len(detections) * 25 + 35) if detections else 20
        return detections, overall_confidence
    
    def detect_agriculture(self, image):
        """Detect agricultural areas"""
        detections = []
        hsv = cv2.cvtColor(image, cv2.COLOR_RGB2HSV)
        
        lower_crop = np.array([25, 30, 30])
        upper_crop = np.array([95, 255, 255])
        crop_mask = cv2.inRange(hsv, lower_crop, upper_crop)
        
        contours, _ = cv2.findContours(crop_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        for contour in contours:
            area = cv2.contourArea(contour)
            if area > 1500:
                x, y, w, h = cv2.boundingRect(contour)
                confidence = 60
                
                detections.append({
                    'class': 'agriculture',
                    'confidence': confidence,
                    'bbox': [int(x), int(y), int(w), int(h)],
                    'area': int(area),
                    'center': [int(x + w/2), int(y + h/2)],
                    'severity': 'low'
                })
        
        overall_confidence = min(75, len(detections) * 12 + 30) if detections else 20
        return detections, overall_confidence
    
    def detect_urban_expansion(self, image):
        """Detect urban areas"""
        detections = []
        gray = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY)
        
        laplacian = cv2.Laplacian(gray, cv2.CV_64F)
        texture_mask = np.uint8(np.absolute(laplacian))
        
        _, urban_mask = cv2.threshold(texture_mask, 30, 255, cv2.THRESH_BINARY)
        
        contours, _ = cv2.findContours(urban_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        for contour in contours:
            area = cv2.contourArea(contour)
            if area > 2500:
                x, y, w, h = cv2.boundingRect(contour)
                confidence = 70
                
                detections.append({
                    'class': 'urban_expansion',
                    'confidence': confidence,
                    'bbox': [int(x), int(y), int(w), int(h)],
                    'area': int(area),
                    'center': [int(x + w/2), int(y + h/2)],
                    'severity': 'medium'
                })
        
        overall_confidence = min(70, len(detections) * 18 + 25) if detections else 15
        return detections, overall_confidence
    
    def detect_water_bodies(self, image):
        """Detect water bodies"""
        detections = []
        hsv = cv2.cvtColor(image, cv2.COLOR_RGB2HSV)
        
        lower_water = np.array([100, 50, 50])
        upper_water = np.array([130, 255, 255])
        water_mask = cv2.inRange(hsv, lower_water, upper_water)
        
        contours, _ = cv2.findContours(water_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        for contour in contours:
            area = cv2.contourArea(contour)
            if area > 1000:
                x, y, w, h = cv2.boundingRect(contour)
                confidence = 75
                
                detections.append({
                    'class': 'water_body',
                    'confidence': confidence,
                    'bbox': [int(x), int(y), int(w), int(h)],
                    'area': int(area),
                    'center': [int(x + w/2), int(y + h/2)],
                    'severity': 'low'
                })
        
        overall_confidence = min(80, len(detections) * 25 + 30) if detections else 20
        return detections, overall_confidence
    
    def general_land_segmentation(self, image):
        """General segmentation with all methods"""
        detections = []
        
        # Apply all detection methods
        deforest_det, _ = self.detect_deforestation(image)
        mining_det, _ = self.detect_mining(image)
        fire_det, _ = self.detect_forest_fire(image)
        agri_det, _ = self.detect_agriculture(image)
        urban_det, _ = self.detect_urban_expansion(image)
        water_det, _ = self.detect_water_bodies(image)
        
        # Combine all detections
        all_detections = deforest_det + mining_det + fire_det + agri_det + urban_det + water_det
        
        overall_confidence = min(90, len(all_detections) * 8 + 50) if all_detections else 35
        return all_detections, overall_confidence
    
    def create_result_image(self, original_image_path, detections, output_path):
        """Create result image with visualization"""
        image = cv2.imread(original_image_path)
        image_rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        
        # Colors for different classes
        colors = {
            'deforestation': (255, 0, 0),      # Red
            'mining': (255, 165, 0),           # Orange
            'forest_fire': (255, 69, 0),       # Red-Orange
            'agriculture': (0, 255, 0),        # Green
            'urban_expansion': (128, 128, 128), # Gray
            'water_body': (0, 0, 255)          # Blue
        }
        
        # Draw bounding boxes
        for detection in detections:
            x, y, w, h = detection['bbox']
            class_name = detection['class']
            confidence = detection['confidence']
            severity = detection.get('severity', 'medium')
            
            color = colors.get(class_name, (255, 255, 255))
            thickness = 4 if severity == 'critical' else 3 if severity == 'high' else 2
            
            # Draw rectangle
            cv2.rectangle(image_rgb, (x, y), (x + w, y + h), color, thickness)
            
            # Label
            label = f"{class_name}: {confidence:.1f}%"
            cv2.putText(image_rgb, label, (x, y - 10), 
                       cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2)
        
        # Save result
        result_bgr = cv2.cvtColor(image_rgb, cv2.COLOR_RGB2BGR)
        cv2.imwrite(output_path, result_bgr)
        
        return output_path

def main():
    try:
        if not DEPENDENCIES_AVAILABLE:
            result = {
                "error": "Advanced dependencies not available",
                "detections": [],
                "confidence": 0,
                "processing_time": 0.5,
                "image_size": {"width": 0, "height": 0},
                "model_used": "OpenCV_basic",
                "resultImagePath": ""
            }
            print(json.dumps(result))
            return
        
        # Get parameters
        params_json = sys.argv[1]
        params = json.loads(params_json)
        
        image_path = params['imagePath']
        output_dir = params['outputDir']
        model_type = params.get('modelType', 'general')
        
        # Initialize segmentation
        segmenter = EnvironmentalSegmentation()
        
        # Process image
        result = segmenter.process_image(image_path, model_type)
        
        # Create result image
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        result_filename = f"segmentation_result_{model_type}_{timestamp}.jpg"
        result_image_path = os.path.join(output_dir, result_filename)
        
        segmenter.create_result_image(image_path, result['detections'], result_image_path)
        result['resultImagePath'] = result_image_path
        
        print(json.dumps(result))
        
    except Exception as e:
        error_result = {
            "error": str(e),
            "detections": [],
            "confidence": 0,
            "processing_time": 0,
            "image_size": {"width": 0, "height": 0},
            "model_used": "error",
            "resultImagePath": ""
        }
        print(json.dumps(error_result))
        sys.exit(1)

if __name__ == "__main__":
    main()
