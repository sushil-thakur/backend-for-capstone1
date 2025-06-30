import { Telegraf } from 'telegraf';
import Alert from '../models/Alerts.js';
import User from '../models/User.js';

// Initialize Telegram bot
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// Send alert to Telegram
const sendTelegramAlert = async (chatId, message, imageUrl) => {
  try {
    let sentMessage;
    
    if (imageUrl) {
      sentMessage = await bot.telegram.sendPhoto(chatId, imageUrl, {
        caption: message,
        parse_mode: 'Markdown'
      });
    } else {
      sentMessage = await bot.telegram.sendMessage(chatId, message, {
        parse_mode: 'Markdown'
      });
    }
    
    return sentMessage.message_id;
  } catch (error) {
    console.error('Error sending Telegram alert:', error);
    throw error;
  }
};

// Configure alert settings
export const configureAlerts = async (req, res) => {
  try {
    const { userId, telegramChatId, alertSettings } = req.body;
    
    // Update user settings
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Update Telegram chat ID if provided
    if (telegramChatId) {
      user.telegramChatId = telegramChatId;
    }
    
    // Update alert settings for each zone if provided
    if (alertSettings && Array.isArray(alertSettings)) {
      for (const setting of alertSettings) {
        const { zoneId, deforestation, mining, landUseChange, realEstateUpdates } = setting;
        
        const zoneIndex = user.zonesOfInterest.findIndex(zone => zone._id.toString() === zoneId);
        
        if (zoneIndex !== -1) {
          user.zonesOfInterest[zoneIndex].monitoringSettings = {
            deforestation: deforestation !== undefined ? deforestation : user.zonesOfInterest[zoneIndex].monitoringSettings.deforestation,
            mining: mining !== undefined ? mining : user.zonesOfInterest[zoneIndex].monitoringSettings.mining,
            landUseChange: landUseChange !== undefined ? landUseChange : user.zonesOfInterest[zoneIndex].monitoringSettings.landUseChange,
            realEstateUpdates: realEstateUpdates !== undefined ? realEstateUpdates : user.zonesOfInterest[zoneIndex].monitoringSettings.realEstateUpdates
          };
        }
      }
    }
    
    await user.save();
    
    res.status(200).json({
      message: 'Alert settings updated successfully',
      telegramChatId: user.telegramChatId,
      zonesOfInterest: user.zonesOfInterest.map(zone => ({
        id: zone._id,
        name: zone.name,
        monitoringSettings: zone.monitoringSettings
      }))
    });
  } catch (error) {
    console.error('Error configuring alerts:', error);
    res.status(500).json({ error: 'Failed to configure alerts' });
  }
};

// Get alerts for a user
export const getAlerts = async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 20, offset = 0, read, alertType, severity, zoneId } = req.query;
    
    // Build query
    const query = { userId };
    
    if (read !== undefined) {
      query.read = read === 'true';
    }
    
    if (alertType) {
      query.alertType = alertType;
    }
    
    if (severity) {
      query.severity = severity;
    }
    
    if (zoneId) {
      query.zoneId = zoneId;
    }
    
    // Get alerts
    const alerts = await Alert.find(query)
      .sort({ createdAt: -1 })
      .skip(parseInt(offset))
      .limit(parseInt(limit));
    
    // Get total count
    const totalCount = await Alert.countDocuments(query);
    
    res.status(200).json({
      alerts,
      totalCount,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    console.error('Error fetching alerts:', error);
    res.status(500).json({ error: 'Failed to fetch alerts' });
  }
};

// Mark alert as read
export const markAlertAsRead = async (req, res) => {
  try {
    const { alertId } = req.params;
    
    const alert = await Alert.findById(alertId);
    
    if (!alert) {
      return res.status(404).json({ error: 'Alert not found' });
    }
    
    alert.read = true;
    await alert.save();
    
    res.status(200).json({
      message: 'Alert marked as read',
      alertId
    });
  } catch (error) {
    console.error('Error marking alert as read:', error);
    res.status(500).json({ error: 'Failed to mark alert as read' });
  }
};

// Test Telegram alert
export const testTelegramAlert = async (req, res) => {
  try {
    const { userId, message, imageUrl } = req.body;
    
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    if (!user.telegramChatId) {
      return res.status(400).json({ error: 'User does not have a Telegram chat ID configured' });
    }
    
    const telegramMessageId = await sendTelegramAlert(
      user.telegramChatId,
      message || 'This is a test alert from your Environmental Monitoring System.',
      imageUrl
    );
    
    res.status(200).json({
      message: 'Test alert sent successfully',
      telegramMessageId
    });
  } catch (error) {
    console.error('Error sending test alert:', error);
    res.status(500).json({ error: 'Failed to send test alert' });
  }
};