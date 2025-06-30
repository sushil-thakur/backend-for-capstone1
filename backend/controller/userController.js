import User from "../models/User.js"

// Create new user
export const createUser = async (req, res) => {
  try {
    const { username, email, telegramChatId } = req.body

    const user = new User({
      username,
      email,
      telegramChatId,
    })

    await user.save()

    res.status(201).json({
      success: true,
      message: "User created successfully",
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        telegramChatId: user.telegramChatId,
        createdAt: user.createdAt,
      },
    })
  } catch (error) {
    console.error("Create user error:", error)
    res.status(500).json({
      error: "Failed to create user",
      details: error.message,
    })
  }
}

// Get all users
export const getAllUsers = async (req, res) => {
  try {
    const { limit = 10, offset = 0, search } = req.query

    const query = { isActive: true }
    if (search) {
      query.$or = [{ username: new RegExp(search, "i") }, { email: new RegExp(search, "i") }]
    }

    const users = await User.find(query)
      .select("-__v")
      .limit(Number.parseInt(limit))
      .skip(Number.parseInt(offset))
      .sort({ createdAt: -1 })

    const total = await User.countDocuments(query)

    res.status(200).json({
      users,
      pagination: {
        total,
        limit: Number.parseInt(limit),
        offset: Number.parseInt(offset),
        hasMore: offset + limit < total,
      },
    })
  } catch (error) {
    console.error("Get users error:", error)
    res.status(500).json({
      error: "Failed to retrieve users",
      details: error.message,
    })
  }
}

// Get user by ID
export const getUserById = async (req, res) => {
  try {
    const { userId } = req.params

    const user = await User.findById(userId).select("-__v")
    if (!user) {
      return res.status(404).json({ error: "User not found" })
    }

    res.status(200).json(user)
  } catch (error) {
    console.error("Get user by ID error:", error)
    res.status(500).json({
      error: "Failed to retrieve user",
      details: error.message,
    })
  }
}

// Update user
export const updateUser = async (req, res) => {
  try {
    const { userId } = req.params
    const updates = req.body

    const user = await User.findByIdAndUpdate(
      userId,
      { ...updates, updatedAt: new Date() },
      { new: true, runValidators: true },
    ).select("-__v")

    if (!user) {
      return res.status(404).json({ error: "User not found" })
    }

    res.status(200).json({
      success: true,
      message: "User updated successfully",
      user,
    })
  } catch (error) {
    console.error("Update user error:", error)
    res.status(500).json({
      error: "Failed to update user",
      details: error.message,
    })
  }
}

// Delete user
export const deleteUser = async (req, res) => {
  try {
    const { userId } = req.params

    const user = await User.findByIdAndUpdate(userId, { isActive: false, updatedAt: new Date() }, { new: true })

    if (!user) {
      return res.status(404).json({ error: "User not found" })
    }

    res.status(200).json({
      success: true,
      message: "User deleted successfully",
    })
  } catch (error) {
    console.error("Delete user error:", error)
    res.status(500).json({
      error: "Failed to delete user",
      details: error.message,
    })
  }
}

// Add zone of interest
export const addZoneOfInterest = async (req, res) => {
  try {
    const { userId } = req.params
    const { name, description, coordinates, monitoringSettings } = req.body

    const user = await User.findById(userId)
    if (!user) {
      return res.status(404).json({ error: "User not found" })
    }

    const newZone = {
      name,
      description,
      geometry: {
        type: "Polygon",
        coordinates: [coordinates],
      },
      monitoringSettings: monitoringSettings || {},
    }

    user.zonesOfInterest.push(newZone)
    await user.save()

    const addedZone = user.zonesOfInterest[user.zonesOfInterest.length - 1]

    res.status(201).json({
      success: true,
      message: "Zone of interest added successfully",
      zone: addedZone,
    })
  } catch (error) {
    console.error("Add zone error:", error)
    res.status(500).json({
      error: "Failed to add zone of interest",
      details: error.message,
    })
  }
}

// Update zone of interest
export const updateZoneOfInterest = async (req, res) => {
  try {
    const { userId, zoneId } = req.params
    const updates = req.body

    const user = await User.findById(userId)
    if (!user) {
      return res.status(404).json({ error: "User not found" })
    }

    const zone = user.zonesOfInterest.id(zoneId)
    if (!zone) {
      return res.status(404).json({ error: "Zone not found" })
    }

    Object.assign(zone, updates)
    await user.save()

    res.status(200).json({
      success: true,
      message: "Zone updated successfully",
      zone,
    })
  } catch (error) {
    console.error("Update zone error:", error)
    res.status(500).json({
      error: "Failed to update zone",
      details: error.message,
    })
  }
}

// Delete zone of interest
export const deleteZoneOfInterest = async (req, res) => {
  try {
    const { userId, zoneId } = req.params

    const user = await User.findById(userId)
    if (!user) {
      return res.status(404).json({ error: "User not found" })
    }

    user.zonesOfInterest.id(zoneId).remove()
    await user.save()

    res.status(200).json({
      success: true,
      message: "Zone deleted successfully",
    })
  } catch (error) {
    console.error("Delete zone error:", error)
    res.status(500).json({
      error: "Failed to delete zone",
      details: error.message,
    })
  }
}
