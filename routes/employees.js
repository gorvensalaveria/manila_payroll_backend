const express = require("express");
const router = express.Router();
const Joi = require("joi");
const { getPool } = require("../dbconfig");

// Validation schema - Updated for new structure
const employeeSchema = Joi.object({
  employeeId: Joi.string().required().max(20),
  firstName: Joi.string().required().max(50),
  lastName: Joi.string().required().max(50),
  email: Joi.string().email().required().max(100),
  phone: Joi.string().allow("").max(20),
  departmentId: Joi.number().integer().positive().allow(null),
  position: Joi.string().required().max(100),
  salary: Joi.number().positive().required(),
  hireDate: Joi.date().required(),
  status: Joi.string().valid("active", "inactive").default("active"),
});

// Validation middleware
const validateEmployee = (req, res, next) => {
  const { error, value } = employeeSchema.validate(req.body);

  if (error) {
    return res.status(400).json({
      success: false,
      error: "Validation failed",
      details: error.details.map((detail) => detail.message),
    });
  }

  req.body = value;
  next();
};

// Error handling middleware
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// GET /api/employees - Get all employees with filtering and pagination
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const {
      search,
      departmentId,
      status,
      page = 1,
      limit = 10,
      sortBy = "created_at",
      sortOrder = "DESC",
    } = req.query;

    const pool = await getPool();

    let query = `
      SELECT 
        e.*,
        d.name as department_name,
        d.description as department_description
      FROM employees e 
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE 1=1
    `;
    const params = [];

    // Add search filter
    if (search) {
      query +=
        " AND (e.employee_id LIKE ? OR e.first_name LIKE ? OR e.last_name LIKE ? OR e.email LIKE ? OR e.position LIKE ? OR d.name LIKE ?)";
      const searchTerm = `%${search}%`;
      params.push(
        searchTerm,
        searchTerm,
        searchTerm,
        searchTerm,
        searchTerm,
        searchTerm
      );
    }

    // Add department filter
    if (departmentId) {
      query += " AND e.department_id = ?";
      params.push(departmentId);
    }

    // Add status filter
    if (status) {
      query += " AND e.status = ?";
      params.push(status);
    }

    // Add sorting
    const validSortColumns = [
      "id",
      "employee_id",
      "first_name",
      "last_name",
      "department_name",
      "salary",
      "hire_date",
      "created_at",
    ];
    const validSortOrders = ["ASC", "DESC"];

    if (
      validSortColumns.includes(sortBy) &&
      validSortOrders.includes(sortOrder.toUpperCase())
    ) {
      const sortColumn =
        sortBy === "department_name" ? "d.name" : `e.${sortBy}`;
      query += ` ORDER BY ${sortColumn} ${sortOrder.toUpperCase()}`;
    } else {
      query += " ORDER BY e.created_at DESC";
    }

    // Get total count for pagination
    let countQuery = `
      SELECT COUNT(*) as total 
      FROM employees e 
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE 1=1
    `;
    const countParams = [];

    if (search) {
      countQuery +=
        " AND (e.employee_id LIKE ? OR e.first_name LIKE ? OR e.last_name LIKE ? OR e.email LIKE ? OR e.position LIKE ? OR d.name LIKE ?)";
      const searchTerm = `%${search}%`;
      countParams.push(
        searchTerm,
        searchTerm,
        searchTerm,
        searchTerm,
        searchTerm,
        searchTerm
      );
    }

    if (departmentId) {
      countQuery += " AND e.department_id = ?";
      countParams.push(departmentId);
    }

    if (status) {
      countQuery += " AND e.status = ?";
      countParams.push(status);
    }

    // Add pagination
    const offset = (page - 1) * limit;
    query += " LIMIT ? OFFSET ?";
    params.push(Number.parseInt(limit), Number.parseInt(offset));

    const [employees] = await pool.execute(query, params);
    const [countResult] = await pool.execute(countQuery, countParams);
    const total = countResult[0].total;

    res.json({
      success: true,
      data: employees,
      pagination: {
        page: Number.parseInt(page),
        limit: Number.parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    });
  })
);

// GET /api/employees/:id - Get single employee
router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    if (!id || isNaN(id)) {
      return res.status(400).json({
        success: false,
        error: "Invalid employee ID",
      });
    }

    const pool = await getPool();
    const [rows] = await pool.execute(
      `
      SELECT 
        e.*,
        d.name as department_name,
        d.description as department_description
      FROM employees e 
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE e.id = ?
    `,
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Employee not found",
      });
    }

    res.json({
      success: true,
      data: rows[0],
    });
  })
);

// POST /api/employees - Create new employee
router.post(
  "/",
  validateEmployee,
  asyncHandler(async (req, res) => {
    const {
      employeeId,
      firstName,
      lastName,
      email,
      phone,
      departmentId,
      position,
      salary,
      hireDate,
      status,
    } = req.body;

    const pool = await getPool();

    // Check if employee ID already exists
    const [existingId] = await pool.execute(
      "SELECT id FROM employees WHERE employee_id = ?",
      [employeeId]
    );
    if (existingId.length > 0) {
      return res.status(400).json({
        success: false,
        error: "Employee ID already exists",
      });
    }

    // Check if email already exists
    const [existingEmail] = await pool.execute(
      "SELECT id FROM employees WHERE email = ?",
      [email]
    );
    if (existingEmail.length > 0) {
      return res.status(400).json({
        success: false,
        error: "Email already exists",
      });
    }

    // Validate department exists if provided
    if (departmentId) {
      const [departmentExists] = await pool.execute(
        "SELECT id FROM departments WHERE id = ?",
        [departmentId]
      );
      if (departmentExists.length === 0) {
        return res.status(400).json({
          success: false,
          error: "Department not found",
        });
      }
    }

    const query = `
      INSERT INTO employees (employee_id, first_name, last_name, email, phone, department_id, position, salary, hire_date, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const [result] = await pool.execute(query, [
      employeeId,
      firstName,
      lastName,
      email,
      phone,
      departmentId,
      position,
      salary,
      hireDate,
      status,
    ]);

    // Fetch the created employee with department info
    const [newEmployee] = await pool.execute(
      `
      SELECT 
        e.*,
        d.name as department_name,
        d.description as department_description
      FROM employees e 
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE e.id = ?
    `,
      [result.insertId]
    );

    res.status(201).json({
      success: true,
      data: newEmployee[0],
      message: "Employee created successfully",
    });
  })
);

// PUT /api/employees/:id - Update employee
router.put(
  "/:id",
  validateEmployee,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const {
      employeeId,
      firstName,
      lastName,
      email,
      phone,
      departmentId,
      position,
      salary,
      hireDate,
      status,
    } = req.body;

    if (!id || isNaN(id)) {
      return res.status(400).json({
        success: false,
        error: "Invalid employee ID",
      });
    }

    const pool = await getPool();

    // Check if employee exists
    const [existing] = await pool.execute(
      "SELECT * FROM employees WHERE id = ?",
      [id]
    );
    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Employee not found",
      });
    }

    // Check if employee ID already exists (excluding current employee)
    const [existingId] = await pool.execute(
      "SELECT id FROM employees WHERE employee_id = ? AND id != ?",
      [employeeId, id]
    );
    if (existingId.length > 0) {
      return res.status(400).json({
        success: false,
        error: "Employee ID already exists",
      });
    }

    // Check if email already exists (excluding current employee)
    const [existingEmail] = await pool.execute(
      "SELECT id FROM employees WHERE email = ? AND id != ?",
      [email, id]
    );
    if (existingEmail.length > 0) {
      return res.status(400).json({
        success: false,
        error: "Email already exists",
      });
    }

    // Validate department exists if provided
    if (departmentId) {
      const [departmentExists] = await pool.execute(
        "SELECT id FROM departments WHERE id = ?",
        [departmentId]
      );
      if (departmentExists.length === 0) {
        return res.status(400).json({
          success: false,
          error: "Department not found",
        });
      }
    }

    const query = `
      UPDATE employees 
      SET employee_id = ?, first_name = ?, last_name = ?, email = ?, phone = ?, department_id = ?, 
          position = ?, salary = ?, hire_date = ?, status = ?
      WHERE id = ?
    `;

    await pool.execute(query, [
      employeeId,
      firstName,
      lastName,
      email,
      phone,
      departmentId,
      position,
      salary,
      hireDate,
      status,
      id,
    ]);

    // Fetch the updated employee with department info
    const [updatedEmployee] = await pool.execute(
      `
      SELECT 
        e.*,
        d.name as department_name,
        d.description as department_description
      FROM employees e 
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE e.id = ?
    `,
      [id]
    );

    res.json({
      success: true,
      data: updatedEmployee[0],
      message: "Employee updated successfully",
    });
  })
);

// DELETE /api/employees/:id - Delete single employee
router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    if (!id || isNaN(id)) {
      return res.status(400).json({
        success: false,
        error: "Invalid employee ID",
      });
    }

    const pool = await getPool();

    // Check if employee exists
    const [existing] = await pool.execute(
      `
      SELECT 
        e.*,
        d.name as department_name
      FROM employees e 
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE e.id = ?
    `,
      [id]
    );
    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Employee not found",
      });
    }

    await pool.execute("DELETE FROM employees WHERE id = ?", [id]);

    res.json({
      success: true,
      data: existing[0],
      message: "Employee deleted successfully",
    });
  })
);

// DELETE /api/employees - Delete multiple employees
router.delete(
  "/",
  asyncHandler(async (req, res) => {
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Employee IDs are required",
      });
    }

    // Validate all IDs are numbers
    const validIds = ids.filter((id) => !isNaN(id) && id > 0);
    if (validIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Valid employee IDs are required",
      });
    }

    const pool = await getPool();

    const placeholders = validIds.map(() => "?").join(",");
    const query = `DELETE FROM employees WHERE id IN (${placeholders})`;

    const [result] = await pool.execute(query, validIds);

    res.json({
      success: true,
      message: `${result.affectedRows} employees deleted successfully`,
      deletedCount: result.affectedRows,
    });
  })
);

module.exports = router;
