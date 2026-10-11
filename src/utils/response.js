function successResponse(res, data = null, message = "Success", statusCode = 200) {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
  });
}

function errorResponse(res, message = "Internal server error", statusCode = 500, errors = undefined) {
  const response = {
    success: false,
    message,
  };

  if (errors !== undefined) {
    response.errors = errors;
  }

  return res.status(statusCode).json(response);
}

module.exports = {
  successResponse,
  errorResponse,
};