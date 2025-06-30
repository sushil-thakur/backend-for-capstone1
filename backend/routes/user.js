import express from 'express'
import {
  createUser,
  getAllUsers,
  getUserById,
  updateUser,
  deleteUser,
  addZoneOfInterest,
  updateZoneOfInterest,
  deleteZoneOfInterest
} from '../controller/userController.js'
import { userValidation, validate } from '../middleware/validation.js' // <-- THIS LINE IS REQUIRED

const router = express.Router()

// User CRUD operations
router.post('/', userValidation.create, validate, createUser);
router.get('/', getAllUsers);
router.get('/:userId', userValidation.getById, validate, getUserById);
router.put('/:userId', userValidation.update, validate, updateUser);
router.delete('/:userId', userValidation.delete, validate, deleteUser);

// Zone management
router.post('/:userId/zones', userValidation.addZone, validate, addZoneOfInterest);
router.put('/:userId/zones/:zoneId', userValidation.updateZone, validate, updateZoneOfInterest);
router.delete('/:userId/zones/:zoneId', userValidation.deleteZone, validate, deleteZoneOfInterest);

export default router;