import express from 'express';
import { 
  configureAlerts, 
  getAlerts, 
  markAlertAsRead, 
  testTelegramAlert 
} from '../controller/alertsController.js';

const router = express.Router();

// Configure alert settings
router.post('/configure', configureAlerts);

// Get alerts for a user
router.get('/user/:userId', getAlerts);

// Mark alert as read
router.put('/:alertId/read', markAlertAsRead);

// Test Telegram alert
router.post('/test-telegram', testTelegramAlert);

export default router;