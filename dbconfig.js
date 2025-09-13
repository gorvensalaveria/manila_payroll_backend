const mysql = require("mysql2/promise");
const dotenv = require("dotenv");

// Load environment variables
dotenv.config();

// Database connection configuration
const dbConfig = {
  connectionLimit: 10,
  queueLimit: 100,
  host: process.env.DB_HOST || "127.0.0.1",
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "manila_payroll",
  connectTimeout: 10000,
  waitForConnections: true,
  multipleStatements: false, // Important: Keep this false for prepared statements
};

// Create a separate connection for initialization (without database)
async function initializeDatabase() {
  try {
    // First connect without specifying a database
    const initConnection = await mysql.createConnection({
      host: dbConfig.host,
      port: dbConfig.port,
      user: dbConfig.user,
      password: dbConfig.password,
    });

    console.log("✅ MySQL Connection established");

    // Create database if it doesn't exist
    // await initConnection.query(
    //   `CREATE DATABASE IF NOT EXISTS ${dbConfig.database}`
    // );
    // console.log(`✅ Database '${dbConfig.database}' is ready`);

    // Close the initialization connection
    await initConnection.end();

    // Now create the main connection pool with the database
    const pool = mysql.createPool(dbConfig);

    // Test the connection
    const connection = await pool.getConnection();
    console.log(`📊 Connected to database: ${dbConfig.database}`);

    // Create tables if they don't exist
    await createTables(connection);

    // Release the connection
    connection.release();

    return pool;
  } catch (error) {
    console.error("❌ Database initialization failed:", error.message);
    throw error;
  }
}

// Function to create tables
async function createTables(connection) {
  try {
    // Check if departments table exists
    const [deptTables] = await connection.query(
      "SHOW TABLES LIKE 'departments'"
    );

    if (deptTables.length === 0) {
      console.log("📝 Creating departments table...");

      // Create departments table
      await connection.query(`
        CREATE TABLE departments (
          id INT AUTO_INCREMENT PRIMARY KEY,
          name VARCHAR(100) NOT NULL UNIQUE,
          description TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
      `);

      // Insert sample departments
      await connection.query(`
        INSERT INTO departments (name, description) VALUES 
        ('Human Resources', 'Manages employee relations and policies'),
        ('Information Technology', 'Handles technology infrastructure and development'),
        ('Finance', 'Manages financial operations and accounting'),
        ('Marketing', 'Handles marketing and promotional activities'),
        ('Operations', 'Manages day-to-day business operations')
      `);

      console.log("✅ Departments table created and populated");
    }

    // Check if employees table exists
    const [empTables] = await connection.query("SHOW TABLES LIKE 'employees'");

    if (empTables.length === 0) {
      console.log("📝 Creating employees table...");

      // Create employees table
      await connection.query(`
        CREATE TABLE employees (
          id INT AUTO_INCREMENT PRIMARY KEY,
          employee_id VARCHAR(20) UNIQUE NOT NULL,
          first_name VARCHAR(50) NOT NULL,
          last_name VARCHAR(50) NOT NULL,
          email VARCHAR(100) UNIQUE NOT NULL,
          phone VARCHAR(20),
          department_id INT,
          position VARCHAR(100),
          salary DECIMAL(10,2),
          hire_date DATE,
          status ENUM('active', 'inactive') DEFAULT 'active',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL,
          
          INDEX idx_employee_id (employee_id),
          INDEX idx_department_id (department_id),
          INDEX idx_status (status),
          INDEX idx_email (email)
        )
      `);

      // Insert sample employees
      await connection.query(`
        INSERT INTO employees (employee_id, first_name, last_name, email, phone, department_id, position, salary, hire_date) VALUES
        ('EMP001', 'Juan', 'Dela Cruz', 'juan.delacruz@manilapayroll.com', '+63-912-345-6789', 1, 'HR Manager', 75000.00, '2023-01-15'),
        ('EMP002', 'Maria', 'Santos', 'maria.santos@manilapayroll.com', '+63-917-234-5678', 2, 'Senior Developer', 85000.00, '2023-02-01'),
        ('EMP003', 'Jose', 'Rizal', 'jose.rizal@manilapayroll.com', '+63-918-345-6789', 3, 'Finance Analyst', 65000.00, '2023-03-10'),
        ('EMP004', 'Ana', 'Garcia', 'ana.garcia@manilapayroll.com', '+63-919-456-7890', 4, 'Marketing Specialist', 60000.00, '2023-04-05'),
        ('EMP005', 'Pedro', 'Morales', 'pedro.morales@manilapayroll.com', '+63-920-567-8901', 5, 'Operations Manager', 80000.00, '2023-05-20')
      `);

      console.log("✅ Employees table created and populated");
    } else {
      // Check if employees table has the old structure (department VARCHAR column)
      try {
        const [columns] = await connection.query(
          "SHOW COLUMNS FROM employees LIKE 'department'"
        );

        if (columns.length > 0) {
          console.log("📝 Updating employees table structure...");

          // Add department_id column if it doesn't exist
          try {
            await connection.query(`
              ALTER TABLE employees 
              ADD COLUMN department_id INT AFTER email,
              ADD FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL
            `);
          } catch (error) {
            // Column might already exist, continue
            console.log(
              "Note: department_id column already exists or couldn't be added"
            );
          }

          // Update status enum values to lowercase if needed
          try {
            await connection.query(`
              ALTER TABLE employees 
              MODIFY COLUMN status ENUM('active', 'inactive') DEFAULT 'active'
            `);
          } catch (error) {
            // Status might already be updated, continue
            console.log(
              "Note: status column already updated or couldn't be modified"
            );
          }

          // Update existing status values to lowercase
          try {
            await connection.query(
              `UPDATE employees SET status = 'active' WHERE status = 'Active'`
            );
            await connection.query(
              `UPDATE employees SET status = 'inactive' WHERE status IN ('Inactive', 'On Leave')`
            );
          } catch (error) {
            // Status values might already be updated, continue
            console.log(
              "Note: status values already updated or couldn't be modified"
            );
          }

          console.log("✅ Employees table structure updated");
        }
      } catch (error) {
        // If the column doesn't exist, that's fine
        console.log("Note: employees table already has the new structure");
      }
    }

    console.log("✅ Database tables are ready");
  } catch (error) {
    console.error("❌ Error creating tables:", error.message);
    throw error;
  }
}

// Initialize the database and create a pool
let pool;
async function getPool() {
  if (!pool) {
    try {
      pool = await initializeDatabase();
    } catch (error) {
      console.error("❌ Failed to initialize database:", error.message);
      // Create a basic pool anyway so the app doesn't crash
      pool = mysql.createPool(dbConfig);
    }
  }
  return pool;
}

// Test connection function
async function testConnection() {
  try {
    const pool = await getPool();
    const connection = await pool.getConnection();
    console.log("✅ MySQL DB Connection established");
    connection.release();
    return true;
  } catch (error) {
    console.error("❌ Database connection failed:", error.message);
    if (error.code === "ER_ACCESS_DENIED_ERROR") {
      console.error("Please check your database credentials in the .env file");
    }
    return false;
  }
}

// Export the functions
module.exports = {
  getPool,
  testConnection,
  get pool() {
    if (!pool) {
      console.warn(
        "⚠️ Pool accessed before initialization, initializing now..."
      );
      getPool().catch((err) =>
        console.error("❌ Pool initialization failed:", err.message)
      );
      // Return a promise-like object that will work with await
      return {
        execute: async (...args) => {
          const realPool = await getPool();
          return realPool.execute(...args);
        },
        query: async (...args) => {
          const realPool = await getPool();
          return realPool.query(...args);
        },
        getConnection: async () => {
          const realPool = await getPool();
          return realPool.getConnection();
        },
      };
    }
    return pool;
  },
};
