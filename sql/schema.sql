CREATE TABLE IF NOT EXISTS departments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS employees (
  id INT AUTO_INCREMENT PRIMARY KEY,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  email VARCHAR(150) UNIQUE,
  position VARCHAR(100),
  salary DECIMAL(12,2),
  department_id INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (department_id) REFERENCES departments(id)
);

INSERT INTO departments (name) VALUES ('HR'), ('Finance'), ('Operations');
INSERT INTO employees (first_name, last_name, email, position, salary, department_id)
VALUES ('Juan','Dela Cruz','juan@example.com','Payroll Admin',25000,1),
       ('Maria','Santos','maria@example.com','Accountant',28000,2);
