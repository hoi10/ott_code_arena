const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const path = require("path");

const routes = require("./routes");
const notFoundMiddleware = require("./middlewares/not-found.middleware");
const errorMiddleware = require("./middlewares/error.middleware");

const app = express();

app.use(helmet());
app.use(cors());
app.use(morgan("dev"));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, "../public")));

app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "API OTT Code Arena đang hoạt động.",
  });
});

app.use("/api", routes);

app.use(notFoundMiddleware);
app.use(errorMiddleware);

module.exports = app;