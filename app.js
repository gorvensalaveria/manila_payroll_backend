var express = require("express");
var path = require("path");
var favicon = require("serve-favicon");
var cookieParser = require("cookie-parser");
var { create } = require("express-handlebars");
var logger = require("morgan");
var loggerutil = require("./utilities/logger");
var datalogger = require("./utilities/datalogger");
var fs = require("fs");
var rfs = require("rotating-file-stream");
var helmet = require("helmet");
var compression = require("compression");
var cors = require("cors");
var { testConnection, getPool } = require("./dbconfig");

// Defining routes
var routes = require("./routes");
var employeesRouter = require("./routes/employees");
var departmentsRouter = require("./routes/departments");
var usersRouter = require("./routes/users");

// Generating an express app

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3001";

var app = express();
app.use(
  cors({
    origin: FRONTEND_URL,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Origin",
      "X-Requested-With",
      "Content-Type",
      "Accept",
      "Authorization",
    ],
  })
);

// Initialize database connection
getPool()
  .then(() => {
    console.log("✅ Database pool initialized");
  })
  .catch((err) => {
    console.error("❌ Database pool initialization failed:", err.message);
  });

// Test database connection on startup
testConnection().then((connected) => {
  if (!connected) {
    console.error(
      "❌ Failed to connect to database. Please check your configuration."
    );
  }
});

// compress all responses
app.use(compression());

// CORS configuration for API endpoints

// Linking log folder and ensure directory exists
var logDirectory = path.join(__dirname, "log");
fs.existsSync(logDirectory) || fs.mkdirSync(logDirectory);
fs.appendFile("./log/ServerData.log", "", (err) => {
  if (err) throw err;
});

// view engine setup - Express-Handlebars
const hbs = create({
  extname: ".hbs",
  defaultLayout: "layout",
  layoutsDir: __dirname + "/views/",
});
app.engine("hbs", hbs.engine);
app.set("view engine", ".hbs");
app.set("views", path.join(__dirname, "views"));

// Create a rotating write stream
var accessLogStream = rfs.createStream("Server.log", {
  size: "10M",
  interval: "1d",
  compress: "gzip",
  path: logDirectory,
});

// Generating date and time for logger
logger.token("datetime", function displayTime() {
  return new Date().toString();
});

// Allowing access headers and requests

// Logging setup
app.use(logger("dev"));
app.use(
  logger(
    ":remote-addr :remote-user :datetime :req[header] :method :url HTTP/:http-version :status :res[content-length] :res[header] :response-time[digits] :referrer :user-agent",
    {
      stream: accessLogStream,
    }
  )
);

// Helmet for security
app.use(helmet());

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

app.use(favicon(path.join(__dirname, "public", "ficon.ico")));

// Health check
app.get("/health", (req, res) => {
  res.json({
    success: true,
    message: "Manila Payroll API is running",
    timestamp: new Date().toISOString(),
    version: "1.0.0",
  });
});

// API info
app.get("/api", (req, res) => {
  res.json({
    message: "Manila Payroll API",
    version: "1.0.0",
    endpoints: {
      health: "/health",
      employees: "/api/employees",
      departments: "/api/departments",
      stats: "/api/stats",
    },
  });
});

// API Routes
app.use("/api/employees", employeesRouter);
app.use("/api/departments", departmentsRouter);
app.use("/api/users", usersRouter);

// Stats
app.get("/api/stats", async (req, res) => {
  try {
    const pool = await getPool();

    const [totalEmployees] = await pool.execute(
      "SELECT COUNT(*) as count FROM employees"
    );
    const [activeEmployees] = await pool.execute(
      "SELECT COUNT(*) as count FROM employees WHERE status = 'active'"
    );
    const [departmentStats] = await pool.execute(`
      SELECT d.name as department, COUNT(e.id) as count 
      FROM departments d
      LEFT JOIN employees e ON d.id = e.department_id
      GROUP BY d.id, d.name
      ORDER BY count DESC
    `);
    const [avgSalary] = await pool.execute(
      "SELECT AVG(salary) as average FROM employees WHERE status = 'active'"
    );
    const [recentEmployees] = await pool.execute(`
      SELECT e.*, d.name as department_name 
      FROM employees e
      LEFT JOIN departments d ON e.department_id = d.id
      ORDER BY e.created_at DESC
      LIMIT 5
    `);

    res.json({
      success: true,
      data: {
        totalEmployees: totalEmployees[0].count,
        activeEmployees: activeEmployees[0].count,
        averageSalary: Math.round(avgSalary[0].average || 0),
        departmentBreakdown: departmentStats,
        recentEmployees: recentEmployees,
      },
    });
  } catch (error) {
    console.error("Error fetching stats:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch statistics",
    });
  }
});

// View route
app.use("/", routes);

// 404 Handler
app.use((req, res, next) => {
  var err = new Error("Not Found");
  err.status = 404;
  next(err);
});

// Error Handler
app.use((err, req, res, next) => {
  res.locals.message = err.message;
  res.locals.error = req.app.get("env") === "development" ? err : {};

  if (req.originalUrl.startsWith("/api")) {
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(400).json({
        success: false,
        error: "Duplicate entry detected",
      });
    }
    if (err.code === "ER_NO_SUCH_TABLE") {
      return res.status(500).json({
        success: false,
        error: "Database table not found",
      });
    }
    return res.status(err.status || 500).json({
      success: false,
      error: err.message || "Internal server error",
    });
  }

  res.status(err.status || 500);
  res.send({ message: "404 Page Not Found..!" });
});

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("\n🛑 SIGINT received, shutting down gracefully...");
  try {
    const pool = await getPool();
    await pool.end();
    console.log("✅ Database connections closed");
  } catch (err) {
    console.error("❌ Error closing database connections:", err.message);
  }
  process.exit(0);
});

// Global error catching
process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at promise", promise, "reason", reason);
});
process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
  process.exit();
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`✅ Server is running on port ${PORT}`);
});

module.exports = app;
