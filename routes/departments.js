const express = require("express");
const router = express.Router();
const { getPool } = require("../dbconfig");

// Get all departments
router.get("/", async (req, res) => {
  try {
    const pool = await getPool();
    const [rows] = await pool.execute(`
        SELECT 
          d.*,
          COUNT(e.id) as employee_count
        FROM departments d
        LEFT JOIN employees e ON d.id = e.department_id
        GROUP BY d.id
        ORDER BY d.name
      `);

    res.json({
      success: true,
      data: rows,
      total: rows.length,
    });
  } catch (error) {
    console.error("Error fetching departments:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch departments",
    });
  }
});

// Get department by ID
router.get("/:id", async (req, res) => {
  try {
    const pool = await getPool();
    const [rows] = await pool.execute(
      "SELECT * FROM departments WHERE id = ?",
      [req.params.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Department not found",
      });
    }

    res.json({
      success: true,
      data: rows[0],
    });
  } catch (error) {
    console.error("Error fetching department:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch department",
    });
  }
});

// Create new department
router.post("/", async (req, res) => {
  try {
    const pool = await getPool();
    const { name, description } = req.body;

    // Validate required fields
    if (!name) {
      return res.status(400).json({
        success: false,
        error: "Department name is required",
      });
    }

    // Check if department already exists
    const [existingDept] = await pool.execute(
      "SELECT id FROM departments WHERE name = ?",
      [name]
    );

    if (existingDept.length > 0) {
      return res.status(400).json({
        success: false,
        error: "Department already exists",
      });
    }

    const [result] = await pool.execute(
      "INSERT INTO departments (name, description) VALUES (?, ?)",
      [name, description]
    );

    const [newDepartment] = await pool.execute(
      "SELECT * FROM departments WHERE id = ?",
      [result.insertId]
    );

    res.status(201).json({
      success: true,
      message: "Department created successfully",
      data: newDepartment[0],
    });
  } catch (error) {
    console.error("Error creating department:", error);
    res.status(500).json({
      success: false,
      error: "Failed to create department",
    });
  }
});

// Update department
router.put("/:id", async (req, res) => {
  try {
    const pool = await getPool();
    const { name, description } = req.body;

    // Check if department exists
    const [existingDept] = await pool.execute(
      "SELECT id FROM departments WHERE id = ?",
      [req.params.id]
    );

    if (existingDept.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Department not found",
      });
    }

    await pool.execute(
      "UPDATE departments SET name = ?, description = ? WHERE id = ?",
      [name, description, req.params.id]
    );

    const [updatedDepartment] = await pool.execute(
      "SELECT * FROM departments WHERE id = ?",
      [req.params.id]
    );

    res.json({
      success: true,
      message: "Department updated successfully",
      data: updatedDepartment[0],
    });
  } catch (error) {
    console.error("Error updating department:", error);
    res.status(500).json({
      success: false,
      error: "Failed to update department",
    });
  }
});

// Delete department
router.delete("/:id", async (req, res) => {
  try {
    const pool = await getPool();
    // Check if department exists
    const [existingDept] = await pool.execute(
      "SELECT id FROM departments WHERE id = ?",
      [req.params.id]
    );

    if (existingDept.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Department not found",
      });
    }

    // Check if department is being used by employees
    const [employeesUsingDept] = await pool.execute(
      "SELECT COUNT(*) as count FROM employees WHERE department_id = ?",
      [req.params.id]
    );

    if (employeesUsingDept[0].count > 0) {
      return res.status(400).json({
        success: false,
        error: "Cannot delete department that is assigned to employees",
      });
    }

    await pool.execute("DELETE FROM departments WHERE id = ?", [req.params.id]);

    res.json({
      success: true,
      message: "Department deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting department:", error);
    res.status(500).json({
      success: false,
      error: "Failed to delete department",
    });
  }
});

module.exports = router;
