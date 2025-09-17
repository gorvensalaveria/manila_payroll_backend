const express = require("express");
const router = express.Router();
const db = require("../config/db");

// 📌 Get all employees with department info
router.get("/", async (req, res) => {
  try {
    const [employees] = await db.query(
      `SELECT e.*, d.name AS department_name
       FROM employees e
       LEFT JOIN departments d ON e.department_id = d.id`
    );

    const [count] = await db.query("SELECT COUNT(*) as total FROM employees");

    res.json({
      success: true,
      data: employees,
      total: count[0].total,
    });
  } catch (error) {
    console.error("Error fetching employees:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 📌 Get a single employee
router.get("/:id", async (req, res) => {
  try {
    const [employee] = await db.query(
      `SELECT e.*, d.name AS department_name
       FROM employees e
       LEFT JOIN departments d ON e.department_id = d.id
       WHERE e.id = ?`,
      [req.params.id]
    );

    if (employee.length === 0) {
      return res
        .status(404)
        .json({ success: false, error: "Employee not found" });
    }

    res.json({ success: true, data: employee[0] });
  } catch (error) {
    console.error("Error fetching employee:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 📌 Create employee
router.post("/", async (req, res) => {
  try {
    const { first_name, last_name, email, phone, department_id } = req.body;

    const [result] = await db.query(
      `INSERT INTO employees (first_name, last_name, email, phone, department_id)
       VALUES (?, ?, ?, ?, ?)`,
      [first_name, last_name, email, phone, department_id]
    );

    const [newEmployee] = await db.query(
      `SELECT e.*, d.name AS department_name
       FROM employees e
       LEFT JOIN departments d ON e.department_id = d.id
       WHERE e.id = ?`,
      [result.insertId]
    );

    res.status(201).json({ success: true, data: newEmployee[0] });
  } catch (error) {
    console.error("Error creating employee:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 📌 Update employee
router.put("/:id", async (req, res) => {
  try {
    const { first_name, last_name, email, phone, department_id } = req.body;

    await db.query(
      `UPDATE employees
       SET first_name = ?, last_name = ?, email = ?, phone = ?, department_id = ?
       WHERE id = ?`,
      [first_name, last_name, email, phone, department_id, req.params.id]
    );

    const [updatedEmployee] = await db.query(
      `SELECT e.*, d.name AS department_name
       FROM employees e
       LEFT JOIN departments d ON e.department_id = d.id
       WHERE e.id = ?`,
      [req.params.id]
    );

    if (updatedEmployee.length === 0) {
      return res
        .status(404)
        .json({ success: false, error: "Employee not found" });
    }

    res.json({ success: true, data: updatedEmployee[0] });
  } catch (error) {
    console.error("Error updating employee:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 📌 Delete employee
router.delete("/:id", async (req, res) => {
  try {
    const [result] = await db.query("DELETE FROM employees WHERE id = ?", [
      req.params.id,
    ]);

    if (result.affectedRows === 0) {
      return res
        .status(404)
        .json({ success: false, error: "Employee not found" });
    }

    res.json({ success: true, message: "Employee deleted successfully" });
  } catch (error) {
    console.error("Error deleting employee:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
